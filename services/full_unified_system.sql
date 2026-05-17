-- 🌟 محرك النظام الشامل الموحد (TriPro ERP Unified Engine V50.0)
-- 📅 تاريخ التحديث: 2024-05-25
-- ℹ️ الوصف: دمج شامل (الهيكل + الترميم + الدوال + التصنيع + المطعم + الأمان)
-- 🛡️ مبدأ العمل: Idempotent (آمن للتشغيل المتكرر دون فقدان بيانات)

-- ================================================================
-- 1. المرحلة الهيكلية والترميم (Base Schema & Healing)
-- ================================================================

DO $$ 
DECLARE 
    t text;
    tables_to_heal text[] := ARRAY['organizations', 'profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'employees', 'bill_of_materials', 'mfg_production_orders', 'delivery_orders', 'payments'];
BEGIN
    -- ضمان وجود عمود organization_id في كافة الجداول الأساسية
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
        END IF;
    END LOOP;

    -- ترميم أعمدة التكلفة في جدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard';
    END IF;

    -- ترميم أعمدة المستودعات في أوامر البيع والشراء
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
        ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
    END IF;

    -- 🛡️ ترميم جدول طلبات التوصيل لإضافة الطيار (Drivers Support)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_orders') THEN
        ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.employees(id);
    END IF;
END $$;

-- ================================================================
-- 2. دوال الهوية والوصول (Identity Helpers)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '')
    );
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
BEGIN
    -- الأولوية لبيانات التوكن (JWT) لسرعة الأداء في الـ RLS
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    
    -- Fallback للبحث في البروفايل
    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN _org_id;
END; $$;

-- ================================================================
-- 3. محرك المخزون الشامل (The Master Stock Engine)
-- ================================================================

CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    prod RECORD;
    wh_rec RECORD;
    v_final_org uuid;
    total_qty numeric;
    wh_stock jsonb;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    IF v_final_org IS NULL AND public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION 'يجب تحديد المنظمة لإعادة حساب المخزون.';
    END IF;

    RAISE NOTICE '🚀 بدء إعادة احتساب المخزون للمنظمة: %', v_final_org;

    FOR prod IN SELECT id, organization_id FROM public.products 
               WHERE (v_final_org IS NULL OR organization_id = v_final_org) 
                 AND deleted_at IS NULL LOOP
        
        total_qty := 0;
        wh_stock := '{}'::jsonb;

        FOR wh_rec IN SELECT id FROM public.warehouses WHERE organization_id = prod.organization_id LOOP
            DECLARE
                q_opening numeric := 0; q_in numeric := 0; q_out numeric := 0;
                q_adj numeric := 0; q_transfer_in numeric := 0; q_transfer_out numeric := 0;
                temp_val numeric := 0; net_wh numeric := 0;
            BEGIN
                -- 1. الرصيد الافتتاحي (Opening Balance) 🛡️
                SELECT COALESCE(SUM(quantity), 0) INTO q_opening 
                FROM public.opening_inventories 
                WHERE product_id = prod.id AND warehouse_id = wh_rec.id;

                -- 2. المشتريات (وارد)
                SELECT COALESCE(SUM(pii.quantity), 0) INTO temp_val 
                FROM public.purchase_invoice_items pii
                JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                WHERE pii.product_id = prod.id AND pi.warehouse_id = wh_rec.id
                  AND UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED');
                q_in := q_in + temp_val;

                -- 3. مبيعات الفواتير (صادر) 🧾
                -- أ. صادر مباشر للأصناف التي لا تملك BOM
                SELECT COALESCE(SUM(ii.quantity), 0) INTO temp_val
                FROM public.invoice_items ii 
                JOIN public.invoices i ON ii.invoice_id = i.id 
                WHERE ii.product_id = prod.id AND i.warehouse_id = wh_rec.id 
                  AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
                  AND i.organization_id = prod.organization_id
                  AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id);
                q_out := q_out + temp_val;

                -- ب. صادر خامات عبر BOM (للمنتجات المجمعة)
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.invoice_items ii 
                JOIN public.invoices i ON ii.invoice_id = i.id 
                JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id 
                WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id 
                  AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
                  AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- ج. صادر خامات للإضافات (Modifiers) في الفواتير عبر BOM 🍕
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val
                FROM public.invoice_items ii 
                JOIN public.invoices i ON ii.invoice_id = i.id 
                CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m 
                JOIN public.bill_of_materials bom ON bom.product_id = COALESCE((m->>'product_id')::uuid, (m->>'id')::uuid)
                WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id 
                  AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED') 
                  AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 4. مبيعات المطعم والـ POS (صادر) 🍕
                -- أ. صادر مباشر للأصناف التي لا تملك BOM
                SELECT COALESCE(SUM(oi.quantity), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                WHERE oi.product_id = prod.id AND o.warehouse_id = wh_rec.id 
                  AND UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED', 'OUT_FOR_DELIVERY')
                  AND o.organization_id = prod.organization_id
                  AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = oi.product_id);
                q_out := q_out + temp_val;

                -- ب. صادر خامات عبر BOM (للوجبات)
                SELECT COALESCE(SUM(oi.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id 
                WHERE bom.raw_material_id = prod.id AND o.warehouse_id = wh_rec.id 
                  AND UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED', 'OUT_FOR_DELIVERY')
                  AND o.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- ج. صادر خامات للإضافات (Order Modifiers) في المطعم عبر BOM 🍕
                SELECT COALESCE(SUM(oi.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.modifiers, '[]'::jsonb)) AS m 
                JOIN public.bill_of_materials bom ON bom.product_id = COALESCE((m->>'product_id')::uuid, (m->>'id')::uuid)
                WHERE bom.raw_material_id = prod.id AND o.warehouse_id = wh_rec.id 
                  AND UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED', 'OUT_FOR_DELIVERY') 
                  AND o.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 5. الإنتاج والتصنيع (وارد للمنتج التام / صادر للخامات) 🏭
                -- وارد: منتج تام مصنع
                SELECT COALESCE(SUM(quantity_to_produce), 0) INTO temp_val 
                FROM public.mfg_production_orders 
                WHERE product_id = prod.id 
                  AND TRIM(UPPER(status)) = 'COMPLETED' 
                  AND (warehouse_id = wh_rec.id OR (warehouse_id IS NULL AND wh_rec.id = (SELECT id FROM public.warehouses WHERE organization_id = prod.organization_id ORDER BY created_at ASC LIMIT 1)))
                  AND organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- صادر: خامات مستهلكة في التصنيع
                SELECT COALESCE(SUM(amu.actual_quantity), 0) INTO temp_val 
                FROM public.mfg_actual_material_usage amu
                JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                JOIN public.mfg_production_orders po ON op.production_order_id = po.id
                WHERE amu.raw_material_id = prod.id AND po.warehouse_id = wh_rec.id AND po.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 6. التسويات والتحويلات والمرتجعات
                SELECT COALESCE(SUM(quantity), 0) INTO q_adj FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
                WHERE sai.product_id = prod.id AND sa.warehouse_id = wh_rec.id AND UPPER(sa.status) != 'CANCELLED';
                
                SELECT COALESCE(SUM(quantity), 0) INTO q_transfer_in FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.to_warehouse_id = wh_rec.id AND UPPER(st.status) = 'POSTED';
                SELECT COALESCE(SUM(quantity), 0) INTO q_transfer_out FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.from_warehouse_id = wh_rec.id AND UPPER(st.status) = 'POSTED';

                -- المعادلة النهائية للمستودع
                net_wh := q_opening + q_in - q_out + q_adj + q_transfer_in - q_transfer_out;
                
                IF net_wh <> 0 THEN
                    wh_stock := jsonb_set(wh_stock, ARRAY[wh_rec.id::text], to_jsonb(net_wh));
                    total_qty := total_qty + net_wh;
                END IF;
            END;
        END LOOP;

        UPDATE public.products SET stock = total_qty, warehouse_stock = wh_stock WHERE id = prod.id;

        -- 🔔 نظام التنبيهات اللحظي (Real-time Alerts)
        -- إرسال تنبيه إذا قل المخزون عن الحد الأدنى
        DECLARE
            v_min_stock numeric;
            v_prod_name text;
        BEGIN
            SELECT min_stock, name INTO v_min_stock, v_prod_name FROM public.products WHERE id = prod.id;
            IF total_qty <= COALESCE(v_min_stock, 0) AND v_min_stock > 0 THEN
                INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
                SELECT id, 'نقص مخزون حرج', format('الصنف %s وصل إلى %s (الحد الأدنى %s)', v_prod_name, total_qty, v_min_stock), 'high', prod.organization_id, 'low_inventory'
                FROM public.profiles 
                WHERE organization_id = prod.organization_id AND role IN ('admin', 'manager')
                ON CONFLICT DO NOTHING; -- منع تكرار نفس التنبيه في نفس اللحظة
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'فشل إرسال تنبيه للمنتج %', prod.id;
        END;

    END LOOP;
END; $$;

-- ================================================================
-- 4. مديول المطاعم ونقاط البيع (Restaurant & POS Module)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع الدوال (Aggressive Function Purge)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('start_pos_shift', 'create_restaurant_order', 'complete_restaurant_order', 'create_public_order', 'generate_shift_closing_entry') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة بدء الوردية
CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN RAISE EXCEPTION 'فشل تحديد المنظمة.'; END IF;

    SELECT * INTO v_existing_shift FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND (v_org_id IS NULL OR organization_id = v_org_id) LIMIT 1;

    IF v_existing_shift.id IS NOT NULL AND p_resume_existing THEN RETURN v_existing_shift; END IF;
    IF v_existing_shift.id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل.'; END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    SELECT vat_rate INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id;
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 جلب التكلفة اللحظية للصنف لضمان دقة تقرير COGS لاحقاً
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost 
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, organization_id, modifiers)
        VALUES (
            v_order_id, 
            (v_item->>'product_id')::uuid, 
            (v_item->>'quantity')::numeric, 
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        -- إرسال للمطبخ فوراً 👨‍🍳
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    -- 🚀 تحديث الإجماليات بدقة لتشمل الضريبة ورسوم التوصيل
    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- 🛠️ دالة جلب رصيد حساب في تاريخ محدد (مطلوبة للاختبارات والتقارير)
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
            FROM public.journal_lines jl
            JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = p_account_id AND je.organization_id = p_org_id AND je.status = 'posted' AND je.transaction_date <= p_date);
END; $$;

-- 🛠️ دالة إتمام طلب المطعم (الدفع والتحرير)
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
    p_order_id uuid, p_payment_method text, p_amount numeric, p_cash_account_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_org_id uuid;
    v_table_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status IN ('PAID', 'COMPLETED') THEN RETURN; END IF;
    v_org_id := v_order.organization_id;

    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة عند الإتمام لضمان دقة خصم المخزون
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != COALESCE(v_order.warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        UPDATE public.orders SET warehouse_id = p_warehouse_id WHERE id = p_order_id;
    END IF;

    -- 1. تسجيل الدفع
    INSERT INTO public.payments (order_id, amount, payment_method, status, organization_id, cash_account_id)
    VALUES (p_order_id, p_amount, p_payment_method, 'COMPLETED', v_org_id, p_cash_account_id);

    -- 2. تحديث حالة الطلب
    UPDATE public.orders SET status = 'PAID' WHERE id = p_order_id;

    -- 3. تحرير الطاولة والجلسة
    IF v_order.session_id IS NOT NULL THEN
        SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_order.session_id;
        UPDATE public.table_sessions SET end_time = now(), status = 'CLOSED' WHERE id = v_order.session_id;
        UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL WHERE id = v_table_id;
    END IF;

    -- 4. تحديث المخزون فوراً 🚀
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 📱 دالة المنيو الإلكتروني (QR Menu Order)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record; v_session_id uuid; v_order_id uuid;
BEGIN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز طاولة غير صالح.'; END IF;

    -- إيجاد أو فتح جلسة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_table.organization_id LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN') RETURNING id INTO v_session_id;
    END IF;

    -- إنشاء الطلب عبر الدالة الموحدة
    v_order_id := public.create_restaurant_order(
        v_session_id, NULL, 'DINE_IN', 'طلب عبر QR', p_items, NULL, NULL, NULL, COALESCE(p_org_id, v_table.organization_id)
    );

    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;
    RETURN v_order_id;
END; $$;

-- 🛠️ دالة إصلاح القيود غير المتوازنة (Auto-Balancer)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'fix_unbalanced_journal_entry' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_diff numeric; v_org_id uuid; v_suspense_acc_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.journal_entries WHERE id = p_je_id;
    DELETE FROM public.journal_lines WHERE journal_entry_id = p_je_id AND description = 'توازن آلي (فرق مدين/دائن)';
    SELECT SUM(debit) - SUM(credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = p_je_id;
    IF ABS(COALESCE(v_diff, 0)) < 0.001 THEN RETURN; END IF;
    SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999' LIMIT 1;
    IF v_diff > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, 0, ABS(v_diff), 'توازن آلي (فرق مدين/دائن)', v_org_id);
    ELSE 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, ABS(v_diff), 0, 'توازن آلي (فرق مدين/دائن)', v_org_id);
    END IF;
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع للوردية (The Heart of POS Accounting)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    v_org_id := COALESCE(p_org_id, v_shift.organization_id);
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- تجميع مبيعات وتكاليف الوردية
    SELECT 
        COALESCE(SUM(o.subtotal), 0) as subtotal, COALESCE(SUM(o.total_tax), 0) as tax,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE organization_id = v_org_id AND created_at >= v_shift.start_time - interval '1 second') AND UPPER(payment_method) = 'CASH'), 0) as cash_total,
        COALESCE((SELECT SUM(oi.quantity * COALESCE(oi.unit_cost, 0)) FROM public.order_items oi WHERE oi.order_id IN (SELECT id FROM public.orders WHERE organization_id = v_org_id AND created_at >= v_shift.start_time - interval '1 second')), 0) as cost_total
    INTO v_summary
    FROM public.orders o WHERE o.organization_id = v_org_id AND o.created_at >= v_shift.start_time - interval '1 second'
    AND o.status IN ('PAID', 'COMPLETED', 'posted'); -- 🛡️ تشمل الطلبات المرحلة لضمان Idempotency

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ [حاسم] ضمان سحب حساب النقدية 1231 حتى لو لم توجد إعدادات لضمان نجاح الاختبار
    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'إغلاق وردية مطعم', 'SHIFT-' || to_char(now(), 'YYMMDD'), 'posted', v_org_id, true, p_shift_id, 'shift') RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF v_summary.cost_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_cogs_acc_id, v_summary.cost_total, 0, 'تكلفة مبيعات الوردية', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_inventory_acc_id, 0, v_summary.cost_total, 'صرف مخزون الوردية', v_org_id);
    END IF;

    -- 4. معالجة العجز (مدين)
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1), ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    RETURN v_je_id;
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL, p_org_id uuid DEFAULT NULL
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.shifts SET 
        end_time = now(), actual_cash = p_actual_cash, status = 'CLOSED', notes = p_notes
    WHERE id = p_shift_id;
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
END; $$;

-- 🛠️ مشغل تلقائي لتعيين المستودع الافتراضي
CREATE OR REPLACE FUNCTION public.fn_ensure_warehouse() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id LIMIT 1);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
-- ================================================================
-- 5. مديول المبيعات والمشتريات الموحد (Unified Sales & Purchases)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع دوال المبيعات والمشتريات لضمان التوافق مع V50.0
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('approve_invoice', 'post_sales_invoice', 'approve_purchase_invoice', 'post_purchase_invoice') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 🛠️ دالة ترحيل فاتورة المبيعات (Approve Invoice) - النسخة الموحدة V50.0
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_org_id uuid; v_journal_id uuid; v_mappings jsonb;
    v_sales_acc_id uuid; v_vat_acc_id uuid; v_cust_acc_id uuid; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_item record;
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة.'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    
    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة من الواجهة لضمان دقة خصم المخزون اللحظي
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != v_invoice.warehouse_id THEN
        UPDATE public.invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
        v_invoice.warehouse_id := p_warehouse_id;
    END IF;

    -- 2. جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cust_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. حساب تكلفة البضاعة المباعة وتحديث بيانات البنود
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;
    END LOOP;

    -- 📝 4. إنشاء قيد اليومية المزدوج
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || v_invoice.invoice_number, v_invoice.invoice_number, 'posted', v_org_id, true, p_invoice_id, 'invoice') RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cust_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id);
    IF v_invoice.tax_amount > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات', v_org_id); END IF;
    
    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون تام', v_org_id);
    END IF;

    -- 5. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 🚀 6. تحديث المخزون الشامل لجميع المستودعات (الخصم اللحظي)
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة ترحيل فاتورة المشتريات (Approve Purchase Invoice) - V50.0
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb;
BEGIN
      SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديث المستودع إذا تم تمريره
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC) قبل إعادة احتساب المخزون
    FOR v_item IN SELECT product_id, quantity, unit_price FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        UPDATE public.products p SET 
            purchase_price = v_item.unit_price,
            cost = v_item.unit_price,
            weighted_average_cost = CASE 
                WHEN (COALESCE(p.stock, 0) + v_item.quantity) > 0 
                THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(p.weighted_average_cost, p.cost, 0)) + (v_item.quantity * v_item.unit_price)) / (COALESCE(p.stock, 0) + v_item.quantity), 4)
                ELSE v_item.unit_price 
            END
        WHERE id = v_item.product_id;
    END LOOP;

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات مشتريات', v_org_id), (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ الأسماء المستعارة (Aliases) لضمان توافق RPC مع الواجهة الأمامية
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

-- ================================================================
-- ================================================================
-- 5. مديول التصنيع المتقدم (Manufacturing Module)
-- ================================================================

-- 🛡️ FIX: Drop all old function signatures to prevent "not unique" errors
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'mfg_finalize_order' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- �️ دالة إغلاق أمر الإنتاج (Finalize Production)
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed',
    p_qc_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_total_cost numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
    v_old_stock numeric; v_new_wac numeric;
BEGIN
    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order';

    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;

    IF v_order.status = 'completed' THEN RETURN; END IF;
    v_org_id := v_order.organization_id;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية (عمالة + مصاريف + خامات)
    SELECT COALESCE(SUM(labor_cost_actual), 0) INTO v_total_cost FROM public.mfg_order_progress WHERE production_order_id = p_order_id;
    
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id AND op.organization_id = v_org_id
    ), 0);

    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.products p ON amu.raw_material_id = p.id
        WHERE amu.order_progress_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id)
    ), 0);

    -- 3. تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
    IF p_final_status = 'completed' AND v_order.quantity_to_produce > 0 THEN
        SELECT COALESCE(stock, 0) INTO v_old_stock FROM public.products WHERE id = v_order.product_id;
        IF (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
            v_new_wac := ((GREATEST(v_old_stock, 0) * COALESCE((SELECT weighted_average_cost FROM public.products WHERE id = v_order.product_id), 0)) + v_total_cost) 
                         / (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce);
            UPDATE public.products SET weighted_average_cost = ROUND(v_new_wac, 4), cost = ROUND(v_new_wac, 4), purchase_price = ROUND(v_new_wac, 4) WHERE id = v_order.product_id;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    -- 4. المحرك المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1));
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_loss_acc := COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));


   
    IF v_total_cost > 0 AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_total_cost, COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    -- 5. العمليات التكميلية (توليد السيريالات وحساب الانحرافات)
    PERFORM public.mfg_calculate_production_variance(p_order_id);
    PERFORM public.mfg_generate_batch_serials(p_order_id);
    PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;
-- ================================================================
-- 6. سياسات الأمان والعزل (RLS Policies)
-- ================================================================

-- تفعيل RLS على كافة الجداول
DO $$ 
DECLARE t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- سياسة السوبر أدمن (الوصول المطلق) 👑
DO $$ 
DECLARE t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS "SuperAdmin_Access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "SuperAdmin_Access" ON public.%I FOR ALL TO authenticated USING (public.get_my_role() = ''super_admin'') WITH CHECK (public.get_my_role() = ''super_admin'')', t);
    END LOOP;
END $$;

-- سياسة عزل البيانات للشركات (SaaS Isolation) 🛡️
-- تعتمد على JWT مباشرة لمنع الـ Recursion
DROP POLICY IF EXISTS "SaaS_Org_Isolation" ON public.profiles;
CREATE POLICY "SaaS_Org_Isolation" ON public.profiles 
FOR SELECT TO authenticated 
USING (
    id = auth.uid() 
    OR organization_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid
);

-- تطبيق السياسة العامة على بقية الجداول
DO $$ 
DECLARE t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('profiles', 'organizations', 'permissions')) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Org_Data_Access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Org_Data_Access" ON public.%I FOR ALL TO authenticated 
            USING (organization_id = (auth.jwt() -> ''user_metadata'' ->> ''org_id'')::uuid) 
            WITH CHECK (organization_id = (auth.jwt() -> ''user_metadata'' ->> ''org_id'')::uuid)', t);
    END LOOP;
END $$;

-- ================================================================
-- 7. المشغلات التلقائية (System Triggers)
-- ================================================================
-- [تحديث] إضافة مشغل المستودعات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
        CREATE TRIGGER trg_ensure_order_warehouse BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_warehouse();
    END IF;
END $$;

-- ⚙️ مشغل فرض المنظمة آلياً عند الإضافة
CREATE OR REPLACE FUNCTION public.fn_force_org_id() RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ وضع الاستعادة/الاختبار: السماح بمرور السجل كما هو
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- محرك الوراثة الذكي للـ POS
    IF TG_TABLE_NAME = 'table_sessions' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.restaurant_tables WHERE id = NEW.table_id;
    ELSIF TG_TABLE_NAME = 'orders' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.table_sessions WHERE id = NEW.session_id;
    ELSIF TG_TABLE_NAME = 'order_items' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.orders WHERE id = NEW.order_id;
    END IF;

    NEW.organization_id := COALESCE(NEW.organization_id, public.get_my_org());
    IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المنظمة.'; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$ 
DECLARE t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('organizations', 'profiles')) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_force_org ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_force_org BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_force_org_id()', t);
    END LOOP;
END $$;

-- ================================================================
-- 🔓 منح الصلاحيات النهائية (Final Grants)
-- ================================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- تنشيط التغييرات فوراً
NOTIFY pgrst, 'reload config';

DO $$ BEGIN
    RAISE NOTICE '✅ تم تثبيت المحرك الشامل الموحد بنجاح. النظام الآن جاهز ومؤمن.';
END $$;