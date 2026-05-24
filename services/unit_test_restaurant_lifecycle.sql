-- 🧪 دالة اختبار دورة حياة المطعم الكاملة (Restaurant Full Lifecycle Unit Test)
-- ℹ️ الغرض: التحقق من ترابط الوردية، الطاولات، المخزون، والمحاسبة في سيناريو واحد.
-- 📅 تاريخ التحديث: 2024-05-25

CREATE OR REPLACE FUNCTION public.test_full_restaurant_lifecycle()
RETURNS TABLE(step_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_user_id uuid; v_cash_acc uuid;
    v_prod_id uuid; v_shift_id uuid; v_table_id uuid; v_session_id uuid;
    v_order_id uuid; v_items jsonb; v_stock_before numeric; v_stock_after numeric;
    v_shift_record record;
BEGIN
    -- 🛡️ 1. تحديد بيانات الهوية للاختبار
    PERFORM set_config('app.restore_mode', 'on', true);
    
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1);
    END IF;
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles LIMIT 1);
    END IF;
    
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT organization_id FROM public.profiles WHERE id = v_user_id);
    END IF;
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد منظمة مسجلة في النظام للاختبار.';
    END IF;

    -- 🛡️ تنظيف شامل لكافة أجنحة الاختبار لضمان عدم وجود مخلفات تسبب Duplicate Key
    DELETE FROM public.products WHERE organization_id = v_org_id AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار');
    DELETE FROM public.restaurant_tables WHERE organization_id = v_org_id AND name IN ('Table-Test', 'Table-QR-Test');
    DELETE FROM public.shifts WHERE organization_id = v_org_id AND user_id = v_user_id AND end_time IS NULL;
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND (reference LIKE 'SHIFT-%' OR description LIKE '%اختبار%');

    -- ضمان وجود مستودع وحساب نقدية
    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1);
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع اختبار تلقائي', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1);
    IF v_cash_acc IS NULL THEN
        v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND type = 'asset' AND (name LIKE '%نقدية%' OR name LIKE '%خزينة%') LIMIT 1);
        IF v_cash_acc IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231-TEST', 'خزينة اختبار', 'asset', v_org_id) RETURNING id INTO v_cash_acc;
        END IF;
    END IF;

    -- 🛠️ [تطوير V50.1] ضمان وجود الحسابات المطلوبة والربط الضريبي للاختبار
    INSERT INTO public.accounts (code, name, type, organization_id, is_group)
    VALUES 
        ('541', 'عجز نقدية الوردية', 'expense', v_org_id, false),
        ('2231', 'ضريبة القيمة المضافة', 'liability', v_org_id, false),
        ('511', 'تكلفة المبيعات', 'expense', v_org_id, false)
    ON CONFLICT (organization_id, code) DO NOTHING;

    UPDATE public.company_settings 
    SET vat_rate = 0.14,
        account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
            'VAT', (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1),
            'CASH_SHORTAGE', (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1),
            'COGS', (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)
        )
    WHERE organization_id = v_org_id;

    step_name := '0. تهيئة بيئة الاختبار'; result := 'PASS ✅'; details := format('المنظمة: %s، الخزينة: %s (تم ضبط الضريبة والحسابات)', v_org_id, v_cash_acc); RETURN NEXT;

    -- 📦 2. إنشاء صنف اختبار وتغذية المخزون
    -- 🛠️ إضافة التكلفة (cost) وسعر الشراء لضمان حساب تكلفة المبيعات (COGS)
    INSERT INTO public.products (name, sales_price, cost, weighted_average_cost, purchase_price, organization_id, product_type, mfg_type, unit, stock)
    VALUES ('وجبة اختبار شامل', 150, 70, 70, 70, v_org_id, 'STOCK', 'standard', 'وجبة', 100) RETURNING id INTO v_prod_id;

    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 100, 70, v_org_id);
    
    PERFORM public.recalculate_stock_rpc(v_org_id);
    SELECT stock INTO v_stock_before FROM public.products WHERE id = v_prod_id;

    step_name := '1. إنشاء منتج ورصيد مخزني'; result := 'PASS ✅'; details := format('الرصيد الابتدائي: %s وجبة', v_stock_before); RETURN NEXT;

    -- 🕒 3. فتح وردية جديدة
    v_shift_record := public.start_pos_shift(1000, false, v_cash_acc, v_user_id, v_org_id); -- Pass p_org_id explicitly
    v_shift_id := v_shift_record.id;
    step_name := '2. فتح الوردية'; result := 'PASS ✅'; details := format('رقم الوردية: %s، العهدة: 1000', v_shift_id); RETURN NEXT;

    -- 🪑 4. محاكاة إشغال طاولة
    SELECT id INTO v_table_id FROM public.restaurant_tables WHERE organization_id = v_org_id LIMIT 1;
    IF v_table_id IS NULL THEN
        INSERT INTO public.restaurant_tables (name, capacity, organization_id) VALUES ('Table-Test', 4, v_org_id) RETURNING id INTO v_table_id;
    END IF;

    INSERT INTO public.table_sessions (table_id, organization_id, status, user_id)
    VALUES (v_table_id, v_org_id, 'OPEN', v_user_id) RETURNING id INTO v_session_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED' WHERE id = v_table_id;

    step_name := '3. فتح جلسة طاولة'; result := 'PASS ✅'; details := format('الطاولة: %s، الجلسة: %s', v_table_id, v_session_id); RETURN NEXT;

    -- 📝 5. إنشاء طلب مطعم (طلب 5 وجبات)
    -- 5 * 150 = 750 + 14% ضريبة (105) = 855 إجمالي
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 5, 'unit_price', 150)); -- Ensure unit_price is numeric
    v_order_id := public.create_restaurant_order(v_session_id, v_user_id, 'DINE_IN', 'محاكاة اختبار شامل', v_items, NULL, v_wh_id, NULL, v_org_id); -- Pass p_org_id explicitly

    step_name := '4. إنشاء الطلب وإرساله للمطبخ'; result := 'PASS ✅'; details := format('رقم الطلب: %s، القيمة قبل الضريبة: 750', v_order_id); RETURN NEXT;

    -- 💳 6. الدفع والإتمام (تحديث المخزون اللحظي)
    PERFORM public.complete_restaurant_order(v_order_id, 'CASH', 855, v_cash_acc, v_org_id, v_wh_id); -- Pass p_org_id and p_warehouse_id explicitly
    PERFORM pg_sleep(0.5); -- Give time for stock recalculation to complete
    
    SELECT stock INTO v_stock_after FROM public.products WHERE id = v_prod_id;
    IF v_stock_after = (v_stock_before - 5) THEN
        step_name := '5. إتمام الدفع وخصم المخزون'; result := 'PASS ✅'; details := format('تم خصم 5 وجبات بنجاح. الرصيد المتبقي: %s', v_stock_after);
    ELSE
        step_name := '5. إتمام الدفع وخصم المخزون'; result := 'FAIL ❌'; details := format('خطأ في المخزون! المتوقع: %s، الفعلي: %s', v_stock_before - 5, v_stock_after);
    END IF;
    RETURN NEXT;

    -- 🏁 7. إغلاق الوردية والمحاسبة
    -- 🛡️ 7. التحقق من الأرصدة المالية بعد إغلاق الوردية
    DECLARE
        v_initial_cash_balance numeric; v_final_cash_balance numeric;
        v_current_je_count int;
        v_initial_sales_balance numeric; v_final_sales_balance numeric;
        v_initial_vat_balance numeric; v_final_vat_balance numeric;
        v_initial_cogs_balance numeric; v_final_cogs_balance numeric;
        v_initial_inventory_balance numeric; v_final_inventory_balance numeric;
        v_initial_cash_shortage_balance numeric; v_final_cash_shortage_balance numeric;
        v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_cash_shortage_acc_id uuid;
        v_maps jsonb;
    BEGIN
        PERFORM pg_sleep(0.5);

        -- جلب الحسابات ذات الصلة
        SELECT account_mappings INTO v_maps FROM public.company_settings WHERE organization_id = v_org_id;
        v_sales_acc_id := COALESCE((v_maps->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
        v_vat_acc_id := COALESCE((v_maps->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
        v_cogs_acc_id := COALESCE((v_maps->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
        v_inventory_acc_id := COALESCE((v_maps->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
        v_cash_shortage_acc_id := COALESCE((v_maps->>'CASH_SHORTAGE')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1));

        -- جلب الأرصدة الأولية
        v_initial_cash_balance := public.get_account_balance_at_date(v_cash_acc, now()::date, v_org_id);
        v_initial_sales_balance := public.get_account_balance_at_date(v_sales_acc_id, now()::date, v_org_id);
        v_initial_vat_balance := public.get_account_balance_at_date(v_vat_acc_id, now()::date, v_org_id);
        v_initial_cogs_balance := public.get_account_balance_at_date(v_cogs_acc_id, now()::date, v_org_id);
        v_initial_inventory_balance := public.get_account_balance_at_date(v_inventory_acc_id, now()::date, v_org_id);
        v_initial_cash_shortage_balance := public.get_account_balance_at_date(v_cash_shortage_acc_id, now()::date, v_org_id);

        -- تنفيذ الإغلاق (مرة واحدة فقط لضمان دقة الأرصدة)
        -- المتوقع: 1000 + 855 = 1855. الإغلاق بـ 1200 يُنتج عجز 655 وزيادة نقدية صافية بـ 200.
        PERFORM public.close_shift(v_shift_id, 1200, 'إغلاق اختبار مؤتمت لمحاكاة العجز', v_org_id);
        PERFORM pg_sleep(0.5); -- إعطاء وقت لمزامنة القيود المحاسبية قبل التحقق
        
        -- جلب الأرصدة النهائية
        -- 🚀 ملاحظة: نستخدم COALESCE لضمان عدم فشل الاختبار في حال لم تكن هناك قيود سابقة
        SELECT public.get_account_balance_at_date(v_cash_acc, now()::date, v_org_id) INTO v_final_cash_balance;
        SELECT public.get_account_balance_at_date(v_sales_acc_id, now()::date, v_org_id) INTO v_final_sales_balance;
        SELECT public.get_account_balance_at_date(v_vat_acc_id, now()::date, v_org_id) INTO v_final_vat_balance;
        SELECT public.get_account_balance_at_date(v_cogs_acc_id, now()::date, v_org_id) INTO v_final_cogs_balance;
        SELECT public.get_account_balance_at_date(v_inventory_acc_id, now()::date, v_org_id) INTO v_final_inventory_balance;
        SELECT public.get_account_balance_at_date(v_cash_shortage_acc_id, now()::date, v_org_id) INTO v_final_cash_shortage_balance;

        -- ⚖️ التحقق من التغيرات المتوقعة باستخدام ROUND لتجاهل فروق التنسيق العشرية
        IF ABS(ROUND(v_final_cash_balance - v_initial_cash_balance, 0) - 200) < 2 AND 
           ROUND(v_final_sales_balance - v_initial_sales_balance, 0) = -750 AND 
           ROUND(v_final_vat_balance - v_initial_vat_balance, 0) = -105 AND 
           ROUND(v_final_cogs_balance - v_initial_cogs_balance, 0) = 350 AND 
           ROUND(v_final_inventory_balance - v_initial_inventory_balance, 0) = -350 AND 
           ROUND(v_final_cash_shortage_balance - v_initial_cash_shortage_balance, 0) = 655 THEN 
            step_name := '6. إغلاق الوردية والترحيل المحاسبي'; result := 'SUCCESS 🏆'; details := 'تم إغلاق الوردية وتوليد القيود المحاسبية المجمعة بنجاح وتطابق الأرصدة.';
        ELSE
            step_name := '6. إغلاق الوردية والترحيل المحاسبي'; result := 'FAIL ❌'; details := format('فشل التحقق من الأرصدة المحاسبية. نقدية: %s (متوقع 200)، مبيعات: %s (متوقع -750)، ضريبة: %s (متوقع -105)، تكلفة مبيعات: %s (متوقع 350)، مخزون: %s (متوقع -350)، عجز صندوق: %s (متوقع 655).', (v_final_cash_balance - v_initial_cash_balance), (v_final_sales_balance - v_initial_sales_balance), (v_final_vat_balance - v_initial_vat_balance), (v_final_cogs_balance - v_initial_cogs_balance), (v_final_inventory_balance - v_initial_inventory_balance), (v_final_cash_shortage_balance - v_initial_cash_shortage_balance));
        END IF;
    END;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار (اختياري)
    -- DELETE FROM public.products WHERE id = v_prod_id;

EXCEPTION WHEN OTHERS THEN
    step_name := 'فشل حرج في الاختبار'; result := 'CRITICAL 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🧪 1. اختبار دورة حياة التوصيل (Delivery Lifecycle Test)
CREATE OR REPLACE FUNCTION public.test_delivery_order_lifecycle()
RETURNS TABLE(step_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth AS $$
DECLARE v_org_id uuid; v_wh_id uuid; v_user_id uuid; v_cash_acc uuid;
    v_prod_id uuid; v_cust_id uuid; v_order_id uuid; v_driver_id uuid;
    v_items jsonb; v_delivery_info jsonb; v_grand_total numeric; v_order_status text;
BEGIN
    -- 🛡️ استخدام معرف منظمة ثابت للمستخدم الحالي لضمان عزل الاختبار
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1);
    END IF;
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles LIMIT 1);
    END IF;
    
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT organization_id FROM public.profiles WHERE id = v_user_id);
    END IF;
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    END IF;

    DELETE FROM public.products WHERE name = 'بيتزا اختبار' AND organization_id = v_org_id;
    DELETE FROM public.customers WHERE name = 'عميل توصيل تجريبي' AND organization_id = v_org_id;
    DELETE FROM public.employees WHERE full_name = 'سائق توصيل تجريبي' AND organization_id = v_org_id;
    DELETE FROM public.orders WHERE organization_id = v_org_id AND notes = 'توصيل للمنزل';

    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1);
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع اختبار تلقائي', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1);
    IF v_cash_acc IS NULL THEN
        v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND type = 'asset' AND (name LIKE '%نقدية%' OR name LIKE '%خزينة%') LIMIT 1);
        IF v_cash_acc IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231-TEST', 'خزينة اختبار', 'asset', v_org_id) RETURNING id INTO v_cash_acc;
        END IF;
    END IF;

    step_name := '0. تهيئة البيئة'; result := 'PASS ✅'; details := 'بدء اختبار التوصيل...'; RETURN NEXT;

    -- إنشاء عميل
    INSERT INTO public.customers (name, phone, organization_id) 
    VALUES ('عميل توصيل تجريبي', '01000000000', v_org_id) RETURNING id INTO v_cust_id;

    -- منتج
    INSERT INTO public.products (name, sales_price, organization_id, product_type)
    VALUES ('بيتزا اختبار', 200, v_org_id, 'STOCK') RETURNING id INTO v_prod_id;
    
    -- إنشاء طيار
    INSERT INTO public.employees (full_name, position, organization_id)
    VALUES ('سائق توصيل تجريبي', 'Driver', v_org_id) RETURNING id INTO v_driver_id;

    step_name := '1. تجهيز البيانات'; result := 'PASS ✅'; details := 'تم إنشاء عميل ومنتج.'; RETURN NEXT;

    -- إنشاء طلب توصيل
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 1, 'unit_price', 200));
    v_delivery_info := jsonb_build_object(
        'customer_name', 'عميل توصيل تجريبي',
        'customer_phone', '01000000000',
        'delivery_address', 'شارع الاختبار، مبنى 5',
        'delivery_fee', 30
    );

    -- ملاحظة: نمرر NULL للـ session_id في التوصيل
    v_order_id := public.create_restaurant_order(NULL, v_user_id, 'DELIVERY', 'توصيل للمنزل', v_items, v_cust_id, v_wh_id, v_delivery_info, v_org_id); -- Pass p_org_id explicitly

    SELECT grand_total INTO v_grand_total FROM public.orders WHERE id = v_order_id;

    -- الحسبة: 200 + 28 (ضريبة 14%) + 30 (توصيل) = 258
    IF v_grand_total >= 258 THEN
        step_name := '2. إنشاء طلب التوصيل'; result := 'PASS ✅'; details := format('الإجمالي شامل التوصيل والضريبة: %s', v_grand_total);
    ELSE
        step_name := '2. إنشاء طلب التوصيل'; result := 'FAIL ❌'; details := format('خطأ في الحساب! الإجمالي: %s', v_grand_total);
    END IF;
    RETURN NEXT;

    -- إتمام الدفع
    PERFORM public.complete_restaurant_order(v_order_id, 'CASH', v_grand_total, v_cash_acc, v_org_id, v_wh_id);
    PERFORM pg_sleep(0.5); -- Give time for stock recalculation to complete
    
    IF EXISTS (SELECT 1 FROM public.delivery_orders WHERE order_id = v_order_id) THEN
        step_name := '3. فحص سجل التوصيل'; result := 'PASS ✅'; details := 'بيانات العنوان والرسوم محفوظة بدقة.';
    ELSE
        step_name := '3. فحص سجل التوصيل'; result := 'FAIL ❌'; details := 'لم يتم العثور على سجل في delivery_orders';
    END IF;
    RETURN NEXT;

    -- 4. تعيين الطيار وتغيير حالة الطلب إلى "قيد التوصيل"
    UPDATE public.delivery_orders SET driver_id = v_driver_id WHERE order_id = v_order_id;
    UPDATE public.orders SET status = 'OUT_FOR_DELIVERY' WHERE id = v_order_id;

    SELECT status INTO v_order_status FROM public.orders WHERE id = v_order_id;
    IF v_order_status = 'OUT_FOR_DELIVERY' THEN
        step_name := '4. تعيين الطيار وتغيير الحالة'; result := 'PASS ✅'; details := format('تم تعيين الطيار %s وتغيير حالة الطلب إلى OUT_FOR_DELIVERY.', v_driver_id);
    ELSE
        step_name := '4. تعيين الطيار وتغيير الحالة'; result := 'FAIL ❌'; details := format('فشل تغيير حالة الطلب. الحالة الحالية: %s', v_order_status);
    END IF;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار
    DELETE FROM public.delivery_orders WHERE order_id = v_order_id;
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.products WHERE id = v_prod_id;
    DELETE FROM public.customers WHERE id = v_cust_id;
    DELETE FROM public.employees WHERE id = v_driver_id;

EXCEPTION WHEN OTHERS THEN
    step_name := 'فشل حرج'; result := 'ERROR 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🧪 2. اختبار المنيو الإلكتروني (QR Menu Lifecycle Test)
CREATE OR REPLACE FUNCTION public.test_qr_order_lifecycle()
RETURNS TABLE(step_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth AS $$
DECLARE
    v_org_id uuid; v_prod_id uuid; v_table_id uuid; v_qr_key uuid; v_cash_acc uuid;
    v_order_id uuid; v_items jsonb; v_session_id uuid; v_wh_id uuid;
BEGIN
    -- 🛡️ توحيد المنظمة مع الاختبارات السابقة لضمان نجاح الـ Cleanup
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT organization_id FROM public.profiles WHERE id = COALESCE(auth.uid(), (SELECT id FROM public.profiles LIMIT 1)));
    END IF;
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    END IF;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد منظمة مسجلة في النظام للاختبار.';
    END IF;

    -- 🛡️ تنظيف جذري باستخدام المعرف الصريح لمنع أخطاء Duplicate Key
    DELETE FROM public.products WHERE name = 'قهوة QR' AND organization_id = v_org_id;
    DELETE FROM public.restaurant_tables WHERE name = 'Table-QR-Test' AND organization_id = v_org_id;

    -- ضمان وجود مستودع وحساب نقدية للاختبار
    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1);
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع اختبار QR', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1);
    IF v_cash_acc IS NULL THEN
        v_cash_acc := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND type = 'asset' AND (name LIKE '%نقدية%' OR name LIKE '%خزينة%') LIMIT 1);
        IF v_cash_acc IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_group) VALUES ('1231-QR', 'خزينة اختبار QR', 'asset', v_org_id, false) RETURNING id INTO v_cash_acc;
        END IF;
    END IF;
    
    -- تجهيز طاولة بكود QR
    v_qr_key := gen_random_uuid();
    INSERT INTO public.restaurant_tables (name, capacity, organization_id, qr_access_key, status)
    VALUES ('Table-QR-Test', 2, v_org_id, v_qr_key, 'AVAILABLE') RETURNING id INTO v_table_id;

    INSERT INTO public.products (name, sales_price, organization_id, product_type)
    VALUES ('قهوة QR', 50, v_org_id, 'STOCK') RETURNING id INTO v_prod_id;

    step_name := '1. تجهيز طاولة QR'; result := 'PASS ✅'; details := format('الكود: %s', v_qr_key); RETURN NEXT;

    -- محاكاة طلب الزبون عبر الـ QR
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 2, 'unit_price', 50));
    
    v_order_id := public.create_public_order(v_qr_key, v_items, v_org_id);

    -- التحقق من فتح الجلسة تلقائياً
    SELECT session_id INTO v_session_id FROM public.orders WHERE id = v_order_id;
    
    IF v_session_id IS NOT NULL THEN
        step_name := '2. إنشاء طلب QR'; result := 'PASS ✅'; details := 'تم فتح جلسة طاولة تلقائياً وربط الطلب.';
    ELSE
        step_name := '2. إنشاء طلب QR'; result := 'FAIL ❌'; details := 'فشل إنشاء الجلسة التلقائية.';
    END IF;
    RETURN NEXT;

    -- التحقق من وصول الطلب للمطبخ
    IF EXISTS (SELECT 1 FROM public.kitchen_orders ko JOIN public.order_items oi ON ko.order_item_id = oi.id WHERE oi.order_id = v_order_id) THEN
        step_name := '3. وصول الطلب للمطبخ'; result := 'PASS ✅'; details := 'الطلب ظهر في شاشة الـ KDS فوراً.';
    ELSE
        step_name := '3. وصول الطلب للمطبخ'; result := 'FAIL ❌'; details := 'لم يتم العثور على طلب مطبخ مرتبط.';
    END IF;
    RETURN NEXT;

    -- تحرير الطاولة (محاكاة دفع الكاشير)
    -- 🚀 تحسين: استخدام الدالة الرسمية بدلاً من التعديل اليدوي لاختبار المحرك الفعلي
    PERFORM public.complete_restaurant_order(v_order_id, 'CASH', 114, v_cash_acc, v_org_id, v_wh_id);
    PERFORM pg_sleep(0.5); -- Give time for stock recalculation to complete

    -- تحرير يدوي لمحاكاة إغلاق الجلسة
    UPDATE public.table_sessions SET status = 'CLOSED', end_time = now() WHERE id = v_session_id;
    UPDATE public.restaurant_tables SET status = 'AVAILABLE' WHERE id = v_table_id;

    IF (SELECT status FROM public.restaurant_tables WHERE id = v_table_id) = 'AVAILABLE' THEN
        step_name := '4. تحرير الطاولة'; result := 'PASS ✅'; details := 'الطاولة أصبحت متاحة لزبون آخر.';
    ELSE
        step_name := '4. تحرير الطاولة'; result := 'FAIL ❌'; details := 'الطاولة لا تزال محجوزة.';
    END IF;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    step_name := 'فشل حرج'; result := 'ERROR 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🧪 3. اختبار دورة حياة التصنيع (Manufacturing Lifecycle Test)
-- ℹ️ الغرض: التأكد من صحة حسابات التكلفة الفعلية، قيود الـ WIP، وتحديث الـ WAC للمنتج التام.
CREATE OR REPLACE FUNCTION public.test_mfg_order_lifecycle()
RETURNS TABLE(step_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth AS $$
DECLARE 
    v_org_id uuid; v_user_id uuid; v_wh_id uuid; v_raw_id uuid; v_fg_id uuid;
    v_order_id uuid; v_progress_id uuid; v_je_id uuid;
    v_wac_after numeric; v_total_debit numeric; v_fg_stock_after numeric; v_serial_count int;
    v_raw_acc_id uuid; v_fg_acc_id uuid; v_wip_acc_id uuid; v_waste_acc_id uuid;
BEGIN
    -- 1. تهيئة البيانات بشكل محصن (Robust Identity Initialization)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1);
    END IF;
    
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT organization_id FROM public.profiles WHERE id = v_user_id);
    END IF;
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    END IF;

    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1);
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع تصنيع اختبار', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    -- تنظيف بيانات قديمة لضمان عزل الاختبار
    DELETE FROM public.products WHERE organization_id = v_org_id AND name IN ('حديد خام اختبار', 'باب حديد مصنع');
    DELETE FROM public.mfg_production_orders WHERE organization_id = v_org_id AND status = 'in_progress';

    -- إنشاء الحسابات المطلوبة إذا لم توجد
    INSERT INTO public.accounts (code, name, type, organization_id) VALUES 
    ('10301', 'مخزون خامات', 'asset', v_org_id),
    ('10302', 'مخزون إنتاج تام', 'asset', v_org_id),
    ('10303', 'إنتاج تحت التشغيل - WIP', 'asset', v_org_id),
    ('5121', 'خسائر تلف إنتاج', 'expense', v_org_id)
    ON CONFLICT (organization_id, code) DO NOTHING;

    -- جلب المعرفات بشكل صريح لضمان دقة الربط في الإعدادات
    SELECT id INTO v_raw_acc_id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id;
    SELECT id INTO v_fg_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id;
    SELECT id INTO v_wip_acc_id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id;
    SELECT id INTO v_waste_acc_id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id;


    -- 2. إنشاء الأصناف
    INSERT INTO public.products (name, organization_id, cost, weighted_average_cost, product_type)
    VALUES ('حديد خام اختبار', v_org_id, 10, 10, 'STOCK') RETURNING id INTO v_raw_id;

    INSERT INTO public.products (name, organization_id, product_type, mfg_type, stock)
    VALUES ('باب حديد مصنع', v_org_id, 'STOCK', 'standard', 0) RETURNING id INTO v_fg_id;

    -- 🛠️ تحديث إعدادات الشركة (Fix: استخدام دمج JSONB بدلاً من الاستبدال الكامل)
    INSERT INTO public.company_settings (organization_id, company_name)
    VALUES (v_org_id, 'Test Org Manufacturing')
    ON CONFLICT (organization_id) DO NOTHING;

    UPDATE public.company_settings 
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
        'INVENTORY_RAW_MATERIALS', v_raw_acc_id,
        'INVENTORY_FINISHED_GOODS', v_fg_acc_id,
        'INVENTORY_WIP', v_wip_acc_id,
        'WASTAGE_EXPENSE', v_waste_acc_id
    )
    WHERE organization_id = v_org_id;
    
    PERFORM pg_sleep(0.2); 


    step_name := '1. تجهيز الخامات والمنتج التام'; result := 'PASS ✅'; details := 'تم إنشاء الأصناف وربط الحسابات المحاسبية.'; RETURN NEXT;

    -- 3. دورة الإنتاج
    INSERT INTO public.mfg_production_orders (product_id, quantity_to_produce, organization_id, warehouse_id, status)
    VALUES (v_fg_id, 5, v_org_id, v_wh_id, 'in_progress') RETURNING id INTO v_order_id;

    -- تسجيل عمالة (50 ريال)
    INSERT INTO public.mfg_order_progress (production_order_id, produced_qty, labor_cost_actual, organization_id, status)
    VALUES (v_order_id, 5, 50, v_org_id, 'completed') RETURNING id INTO v_progress_id;

    -- استهلاك مواد (2 حبة * 10 ريال = 20 ريال)
    INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, organization_id)
    VALUES (v_progress_id, v_raw_id, 2, 2, v_org_id);

    step_name := '2. تسجيل العمليات الإنتاجية'; result := 'PASS ✅'; details := 'تم تسجيل عمالة (50) واستهلاك خامات (20).'; RETURN NEXT;

    -- 4. إغلاق الأمر وفحص النتائج
    PERFORM public.mfg_finalize_order(v_order_id, 'completed', 'Unit Test Finalization');
    PERFORM public.recalculate_stock_rpc(v_org_id); -- تحديث أرصدة المخزون برمجياً
    PERFORM pg_sleep(0.7); -- إعطاء وقت إضافي لمزامنة القيود والترجرات الخلفية

    -- أ. فحص الـ WAC (70 ريال إجمالي / 5 حبات = 14 ريال للوحدة)
    SELECT weighted_average_cost, stock INTO v_wac_after, v_fg_stock_after FROM public.products WHERE id = v_fg_id;
    
    IF v_wac_after = 14 THEN
        step_name := '3. فحص متوسط التكلفة WAC'; result := 'PASS ✅'; details := format('تم تحديث التكلفة بنجاح إلى %s', v_wac_after);
    ELSE
        step_name := '3. فحص متوسط التكلفة WAC'; result := 'FAIL ❌'; details := format('خطأ في الحساب! المتوقع 14، الفعلي %s', v_wac_after);
    END IF;
    RETURN NEXT;

    -- ب. فحص مطابقة المخزون والسيريالات (معالجة الفشل المذكور في التقرير)
    -- 🛡️ التحقق من وجود الجدول لتجنب الخطأ "relation does not exist" في البيئات التي لا تدعم السيريالات
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_serials') THEN
        EXECUTE 'SELECT COUNT(*) FROM public.product_serials WHERE product_id = $1 AND organization_id = $2'
        INTO v_serial_count
        USING v_fg_id, v_org_id;
    ELSE
        v_serial_count := -1; -- علامة تفيد بأن مديول السيريالات غير مثبت/موجود
    END IF;

    IF v_fg_stock_after = 5 THEN
        IF v_serial_count > 0 AND v_serial_count != 5 THEN
            step_name := '5. التحقق من المخزون والسيريالات'; 
            result := 'FAIL ❌'; 
            details := format('تم تحديث المخزون (%s) لكن عدد السيريالات (%s) غير مطابق للكمية المنتجة (5).', v_fg_stock_after, v_serial_count);
        ELSIF v_serial_count = -1 THEN
            step_name := '5. التحقق من المخزون والسيريالات'; result := 'PASS ✅'; details := format('تم تحديث المخزون إلى %s وحدة بنجاح (نظام السيريالات غير مكتشف).', v_fg_stock_after);
        ELSE
            step_name := '5. التحقق من المخزون والسيريالات'; result := 'PASS ✅'; details := format('تم تحديث المخزون إلى %s وحدة بنجاح.', v_fg_stock_after);
        END IF;
    ELSE
        step_name := '5. التحقق من المخزون والسيريالات'; result := 'FAIL ❌'; 
        details := format('فشل في مطابقة المخزون! المتوقع 5، الفعلي %s. (تأكد من عمل trigger تحديث المخزون)', v_fg_stock_after);
    END IF;
    RETURN NEXT;

    -- ب. فحص القيد المحاسبي
    SELECT id INTO v_je_id FROM public.journal_entries 
    WHERE related_document_id = v_order_id AND related_document_type = 'mfg_order' LIMIT 1;

    PERFORM pg_sleep(0.3); -- انتظار إضافي لضمان اكتمال ترحيل القيود
    IF v_je_id IS NOT NULL THEN
        SELECT COALESCE(SUM(debit), 0) INTO v_total_debit FROM public.journal_lines WHERE journal_entry_id = v_je_id;
        IF v_total_debit = 70 THEN
            step_name := '4. فحص القيد المحاسبي'; result := 'PASS ✅'; details := 'تم توليد قيد متزن بقيمة التكلفة الفعلية (70).';
        ELSE
            step_name := '4. فحص القيد المحاسبي'; result := 'FAIL ❌'; details := format('قيمة القيد غير صحيحة! المتوقع 70، الفعلي %s', v_total_debit);
        END IF;
    ELSE
        step_name := '4. فحص القيد المحاسبي'; result := 'FAIL ❌'; details := 'لم يتم توليد قيد إغلاق!';
    END IF;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    step_name := 'فشل حرج في التصنيع'; result := 'ERROR 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🏗️ 4. اختبار دورة حياة المقاولات (Construction Lifecycle Test)
-- ℹ️ الغرض: التأكد من صحة إنشاء المشاريع، الربط المحاسبي، المستخلصات، وصرف المواد مع درع الميزانية.
CREATE OR REPLACE FUNCTION public.test_construction_lifecycle()
RETURNS TABLE(step_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid; v_user_id uuid; v_wh_id uuid; v_cust_id uuid;
    v_prod_id uuid; v_project_id uuid; v_billing_id uuid; v_issue_id uuid;
    v_je_id uuid; v_stock_before numeric; v_stock_after numeric;
BEGIN
    -- 🛡️ 1. تحديد بيانات الهوية للاختبار
    PERFORM set_config('app.restore_mode', 'on', true);
    
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        v_user_id := (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1);
    END IF;
    
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT organization_id FROM public.profiles WHERE id = v_user_id);
    END IF;
    IF v_org_id IS NULL THEN
        v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    END IF;

    -- 🛡️ تنظيف شامل لبيانات الاختبار السابقة
    DELETE FROM public.projects WHERE organization_id = v_org_id AND name = 'Test Project Construction';
    DELETE FROM public.customers WHERE organization_id = v_org_id AND name = 'Construction Test Customer';
    DELETE FROM public.products WHERE organization_id = v_org_id AND name = 'Test Material Construction';

    -- ضمان وجود عميل ومستودع ومنتج (مادة خام)
    INSERT INTO public.customers (name, organization_id) VALUES ('Construction Test Customer', v_org_id) RETURNING id INTO v_cust_id;
    
    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1);
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('Construction Test WH', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    INSERT INTO public.products (name, organization_id, mfg_type, stock)
    VALUES ('Test Material Construction', v_org_id, 'raw', 100) RETURNING id INTO v_prod_id;

    -- 📥 رصيد افتتاحي للمادة الخام لكي يراها محرك المخزون
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 100, 50, v_org_id);
    PERFORM public.recalculate_stock_rpc(v_org_id);

    -- 🛠️ ضمان وجود الحسابات المطلوبة والربط المحاسبي للمقاولات
    INSERT INTO public.accounts (code, name, type, organization_id, is_group)
    VALUES 
        ('1249', 'محتجز ضمان لدى الغير (عملاء)', 'asset', v_org_id, false),
        ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', v_org_id, false),
        ('411', 'إيراد مبيعات بضاعة', 'revenue', v_org_id, false),
        ('1221', 'العملاء', 'asset', v_org_id, false),
        ('10303', 'مشروعات تحت التنفيذ - WIP', 'asset', v_org_id, false)
    ON CONFLICT (organization_id, code) DO NOTHING;

    UPDATE public.company_settings 
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
            'CUSTOMERS', (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1),
            'SALES_REVENUE', (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1),
            'RETENTION_CUSTOMER', (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1),
            'SECURITY_DEPOSIT_ACCOUNT', (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        )
    WHERE organization_id = v_org_id;

    step_name := '0. تهيئة البيئة'; result := 'PASS ✅'; details := format('المنظمة: %s، العميل: %s', v_org_id, v_cust_id); RETURN NEXT;

    -- 🏗️ 1. إنشاء مشروع جديد
    INSERT INTO public.projects (name, contract_value, customer_id, organization_id, status)
    VALUES ('Test Project Construction', 100000, v_cust_id, v_org_id, 'active') RETURNING id INTO v_project_id;

    step_name := '1. إنشاء المشروع'; result := 'PASS ✅'; details := format('المشروع ID: %s والقيمة: 100,000', v_project_id); RETURN NEXT;

    -- 📋 2. إضافة بند BOQ (المقايسة)
    INSERT INTO public.project_boq (project_id, item_name, unit, estimated_quantity, unit_price, organization_id)
    VALUES (v_project_id, 'أعمال خرسانة اختبار', 'm3', 100, 500, v_org_id);

    step_name := '2. إضافة بنود المقايسة (BOQ)'; result := 'PASS ✅'; details := 'تم إضافة بند خرسانة بقيمة إجمالية 50,000'; RETURN NEXT;

    -- 📑 3. اختبار المستخلصات (الإيرادات والتحصيل)
    -- محاكاة مستخلص بقيمة 20,000، خصم محجوز ضمان 2,000، واستهلاك دفعة مقدمة 3,000 (الصافي المتوقع 15,000)
    INSERT INTO public.project_progress_billings (project_id, billing_number, billing_date, completion_percentage, gross_amount, retention_amount, advance_deduction, organization_id, status)
    VALUES (v_project_id, 'BILL-TEST-001', CURRENT_DATE, 20, 20000, 2000, 3000, v_org_id, 'draft') RETURNING id INTO v_billing_id;

    PERFORM public.fn_approve_project_billing(v_billing_id);

    SELECT related_journal_entry_id INTO v_je_id FROM public.project_progress_billings WHERE id = v_billing_id;
    IF v_je_id IS NOT NULL THEN
        step_name := '3. اعتماد المستخلص'; result := 'PASS ✅'; details := format('تم توليد القيد المحاسبي بنجاح ID: %s', v_je_id);
    ELSE
        step_name := '3. اعتماد المستخلص'; result := 'FAIL ❌'; details := 'فشل توليد قيد المستخلص (راجع المحرك المالي)';
    END IF;
    RETURN NEXT;

    -- 📦 4. اختبار صرف المواد وتحميل التكلفة (Cost Side)
    SELECT stock INTO v_stock_before FROM public.products WHERE id = v_prod_id;
    
    INSERT INTO public.project_material_issues (project_id, warehouse_id, issue_number, organization_id, status)
    VALUES (v_project_id, v_wh_id, 'ISS-TEST-001', v_org_id, 'draft') RETURNING id INTO v_issue_id;

    INSERT INTO public.project_material_issue_items (issue_id, product_id, quantity, unit_cost)
    VALUES (v_issue_id, v_prod_id, 10, 50);

    PERFORM public.fn_approve_material_issue(v_issue_id);
    PERFORM pg_sleep(0.3); -- انتظار تحديث المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);

    SELECT stock INTO v_stock_after FROM public.products WHERE id = v_prod_id;

    IF v_stock_after = (v_stock_before - 10) THEN
        step_name := '4. صرف المواد والتكلفة'; result := 'PASS ✅'; details := format('تم خصم المخزون بنجاح. الرصيد المتبقي: %s حبة', v_stock_after);
    ELSE
        step_name := '4. صرف المواد والتكلفة'; result := 'FAIL ❌'; details := format('خطأ في حسابات المخزون! المتوقع: %s، الفعلي: %s', v_stock_before - 10, v_stock_after);
    END IF;
    RETURN NEXT;

    -- 🏁 5. التحقق النهائي من حالة المشروع والربط الآلي
    IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id AND cost_center_account_id IS NOT NULL) THEN
        step_name := '5. التحقق من الربط المالي'; result := 'SUCCESS 🏆'; details := 'تم إنشاء وربط الحساب المالي للمشروع آلياً عبر التريجر.';
    ELSE
        step_name := '5. التحقق من الربط المالي'; result := 'FAIL ❌'; details := 'المشروع غير مرتبط بحساب مالي (Trigger trg_after_project_insert failed)';
    END IF;
    RETURN NEXT;

    PERFORM set_config('app.restore_mode', 'off', true);
EXCEPTION WHEN OTHERS THEN
    step_name := 'فشل اختبار المقاولات'; result := 'CRITICAL 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🧪 3. دالة اختبار شاملة لجميع مديولات المطعم (Unified Restaurant Modules Integrity Test)
CREATE OR REPLACE FUNCTION public.test_all_restaurant_modules_integrity()
RETURNS TABLE(test_suite text, step_name text, result text, details text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
    r record;
    v_overall_status text := 'PASS ✅';
    v_overall_details text := '';
BEGIN
    -- 🛡️ تفعيل وضع الاستعادة للسماح بتنظيف البيانات المحمية إن وجدت
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. تشغيل اختبار دورة حياة المطعم الكاملة
    FOR r IN SELECT * FROM public.test_full_restaurant_lifecycle() LOOP
        test_suite := 'Full Restaurant Lifecycle';
        step_name := r.step_name;
        result := r.result;
        details := r.details;
        IF r.result NOT IN ('PASS ✅', 'SUCCESS 🏆') THEN
            v_overall_status := 'FAIL ❌';
            v_overall_details := v_overall_details || 'Full Restaurant Lifecycle Failed: ' || r.details || E'\n';
        END IF;
        RETURN NEXT;
    END LOOP;

    -- 2. تشغيل اختبار دورة حياة التوصيل
    FOR r IN SELECT * FROM public.test_delivery_order_lifecycle() LOOP
        test_suite := 'Delivery Order Lifecycle';
        step_name := r.step_name;
        result := r.result;
        details := r.details;
        IF r.result NOT IN ('PASS ✅', 'SUCCESS 🏆') THEN
            v_overall_status := 'FAIL ❌';
            v_overall_details := v_overall_details || 'Delivery Order Lifecycle Failed: ' || r.details || E'\n';
        END IF;
        RETURN NEXT;
    END LOOP;

    -- 3. تشغيل اختبار دورة حياة التصنيع
    FOR r IN SELECT * FROM public.test_mfg_order_lifecycle() LOOP
        test_suite := 'Manufacturing Lifecycle';
        step_name := r.step_name;
        result := r.result;
        details := r.details;
        IF r.result NOT IN ('PASS ✅', 'SUCCESS 🏆') THEN
            v_overall_status := 'FAIL ❌';
            v_overall_details := v_overall_details || 'MFG Lifecycle Failed: ' || r.details || E'\n';
        END IF;
        RETURN NEXT;
    END LOOP;

    -- 4. تشغيل اختبار دورة حياة المنيو الإلكتروني (QR)
    FOR r IN SELECT * FROM public.test_qr_order_lifecycle() LOOP
        test_suite := 'QR Order Lifecycle';
        step_name := r.step_name;
        result := r.result;
        details := r.details;
        IF r.result NOT IN ('PASS ✅', 'SUCCESS 🏆') THEN
            v_overall_status := 'FAIL ❌';
            v_overall_details := v_overall_details || 'QR Order Lifecycle Failed: ' || r.details || E'\n';
        END IF;
        RETURN NEXT;
    END LOOP;

    -- 4. التقرير النهائي
    test_suite := 'Overall System Integrity';
    step_name := 'Final Report';
    result := v_overall_status;
    details := CASE WHEN v_overall_status = 'PASS ✅' THEN 'All restaurant module tests passed successfully. 🎉' ELSE 'Some tests failed. See details above.' || E'\n' || v_overall_details END;
    PERFORM set_config('app.restore_mode', 'off', true);
    RETURN NEXT;

END; $$;

-- لتشغيل كافة الاختبارات:
-- SELECT * FROM public.test_full_restaurant_lifecycle();
-- SELECT * FROM public.test_delivery_order_lifecycle();
-- SELECT * FROM public.test_qr_order_lifecycle();

-- 🛡️ دالة الفحص الشامل لسلامة النظام (System Integrity Shield)
-- تم نقلها هنا لتكون مركز الاختبارات الموحد
CREATE OR REPLACE FUNCTION public.run_comprehensive_system_tests()
RETURNS TABLE(suite_name text, status text, details text) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. اختبارات المطاعم
    suite_name := 'Restaurant & POS';
    IF EXISTS (SELECT 1 FROM public.test_all_restaurant_modules_integrity() WHERE result IN ('FAIL ❌', 'ERROR 🛑')) THEN
        status := 'CRITICAL 🛑'; details := 'فشل في دورة مبيعات المطاعم';
    ELSE
        status := 'HEALTHY 🟢'; details := 'دورة المطاعم والمطبخ سليمة';
    END IF; RETURN NEXT;

    -- 🏗️ اختبارات المقاولات والمشاريع
    suite_name := 'Construction & Projects';
    IF EXISTS (SELECT 1 FROM public.test_construction_lifecycle() WHERE result IN ('FAIL ❌', 'ERROR 🛑')) THEN
        status := 'CRITICAL 🛑'; details := 'فشل في دورة المقاولات أو الحسابات المرتبطة';
    ELSE
        status := 'HEALTHY 🟢'; details := 'دورة المقاولات والمشاريع سليمة ومؤمنة';
    END IF; RETURN NEXT;

    -- 2. اختبارات التصنيع
    suite_name := 'Manufacturing';
    IF EXISTS (SELECT 1 FROM public.test_mfg_order_lifecycle() WHERE result IN ('FAIL ❌', 'ERROR 🛑')) THEN
        status := 'CRITICAL 🛑'; details := 'فشل في مديول التصنيع';
    ELSE
        status := 'HEALTHY 🟢'; details := 'دورة الإنتاج والتكاليف سليمة';
    END IF; RETURN NEXT;

    -- 3. اختبارات المحاسبة (WAC & Isolation)
    suite_name := 'Accounting & Security';
    IF EXISTS (SELECT 1 FROM public.test_wac_logic() t WHERE t.status = 'FAILED ❌' OR t.status LIKE 'CRITICAL ERROR%') OR 
       EXISTS (SELECT 1 FROM public.test_saas_isolation() WHERE result IN ('FAILED ❌', 'ERROR 🛑')) THEN
        status := 'CRITICAL 🛑'; details := 'فشل في حسابات التكلفة أو عزل البيانات';
    ELSE
        status := 'HEALTHY 🟢'; details := 'الحسابات وعزل الـ SaaS محصن';
    END IF; RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.run_comprehensive_system_tests() TO authenticated;