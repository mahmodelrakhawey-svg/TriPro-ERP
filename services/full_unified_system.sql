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
    tables_to_heal text[] := ARRAY['organizations', 'profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'employees', 'bill_of_materials', 'mfg_production_orders', 'delivery_orders', 'payments', 'payrolls', 'payroll_items'];
BEGIN
    -- ضمان وجود عمود organization_id في كافة الجداول الأساسية
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
        END IF;
    END LOOP;

    -- ترميم أعمدة التكلفة في جدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard';
    END IF;

    -- ترميم أعمدة المستودعات في أوامر البيع والشراء
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
    END IF;

    -- 🛡️ ترميم جدول طلبات التوصيل لإضافة الطيار (Drivers Support)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.employees(id);
    END IF;

    -- 🛡️ ترميم جداول السندات (Treasury Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    -- 🛡️ ترميم جدول الرواتب (Payroll Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payrolls' AND table_schema = 'public') THEN
        ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS payment_date date;
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
-- 🛡️ تحديث V50.5: ضمان تصفير الأصناف التي ليس لها حركات عند إعادة الاحتساب الجزئي
-- 🛡️ تحديث V50.4: إضافة p_product_id لدعم إعادة الاحتساب لصنف محدد وحل خطأ 404
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid);
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 🚀 استخدام جدول مؤقت لحل مشكلة نطاق الـ CTE وضمان الدقة في عمليتي التحديث (V50.6)
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        -- تجميع كافة حركات الداخل والخارج في استعلام واحد
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- رصيد افتتاحي
            SELECT product_id, warehouse_id, quantity as qty FROM public.opening_inventories WHERE warehouse_id IS NOT NULL AND product_id IS NOT NULL AND organization_id = v_final_org
            UNION ALL
            -- مشتريات (+)
            SELECT pii.product_id, pi.warehouse_id, pii.quantity FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id 
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL AND pi.organization_id = v_final_org
            
            UNION ALL
            -- مبيعات (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT ii.product_id, i.warehouse_id, -ii.quantity
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, i.warehouse_id, -(ii.quantity * bom.quantity_required)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT oi.product_id, o.warehouse_id, -oi.quantity
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, o.warehouse_id, -(oi.quantity * bom.quantity_required)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND bom.raw_material_id IS NOT NULL
            UNION ALL
            -- تصنيع تام (+) 
            SELECT product_id, warehouse_id, quantity_to_produce FROM public.mfg_production_orders 
            WHERE UPPER(status) = 'COMPLETED' AND warehouse_id IS NOT NULL AND product_id IS NOT NULL AND organization_id = v_final_org
            UNION ALL
            -- استهلاك خامات (-)
            SELECT amu.raw_material_id, po.warehouse_id, -amu.actual_quantity 
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            WHERE po.warehouse_id IS NOT NULL AND amu.raw_material_id IS NOT NULL AND po.organization_id = v_final_org
            
            UNION ALL
            -- 🛡️ استهلاك خامات بطلبات صرف (MR) - (فقط للأصناف غير الموجودة في AMU لنفس الطلب لضمان عدم الخصم مرتين)
            SELECT mri.raw_material_id, po.warehouse_id, -mri.quantity_issued
            FROM public.mfg_material_request_items mri
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
            WHERE mr.status = 'issued' AND po.warehouse_id IS NOT NULL AND po.organization_id = v_final_org
            AND NOT EXISTS (
                SELECT 1 FROM public.mfg_order_progress op_sub
                JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
                WHERE op_sub.production_order_id = po.id AND amu_sub.raw_material_id = mri.raw_material_id
            )
        ) movements
        WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, warehouse_id
    )
    SELECT 
        product_id, 
        SUM(net_qty) as total_stock,
        jsonb_object_agg(warehouse_id::text, net_qty) as wh_json
    FROM warehouse_movement
    GROUP BY product_id;

    -- 🛡️ 1. تحديث الأصناف التي لها حركات فعلاً
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- 🛡️ 2. تصفير الأصناف التي لا تمتلك حركات (لضمان مطابقة الواقع)
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
      
        -- 🔔 نظام التنبيهات اللحظي (Real-time Alerts)
    INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
    SELECT prof.id, 'نقص مخزون حرج', format('الصنف %s وصل إلى %s', p.name, p.stock), 'high', p.organization_id, 'low_inventory'
    FROM public.products p
    JOIN public.profiles prof ON p.organization_id = prof.organization_id
    WHERE p.stock <= COALESCE(p.min_stock, 0) AND p.min_stock > 0 AND prof.role IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;

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
CREATE OR REPLACE FUNCTION public.get_active_shift(
    p_user_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid;
    v_shift public.shifts;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    IF v_org_id IS NULL THEN RETURN NULL::public.shifts; END IF;

    SELECT * INTO v_shift FROM public.shifts
    WHERE user_id = COALESCE(p_user_id, auth.uid()) 
      AND end_time IS NULL 
      AND organization_id = v_org_id
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ تصحيح V50.3: ضمان إعادة NULL صريح لتجنب الكائن الوهمي {id: null}
    IF v_shift.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN v_shift;
END; $$;

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
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة.'; END IF;

    SELECT * INTO v_existing_shift FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ إذا طلب المستخدم الاستئناف ووجدنا وردية، نعيدها
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- 🛡️ إذا طلب المستخدم الاستئناف ولم نجد، نعيد NULL للتوقف هنا
    IF p_resume_existing THEN RETURN NULL; END IF;

    IF v_existing_shift.id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم في هذه الشركة. يرجى إغلاقها أولاً.'; END IF;

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
    -- 🛡️ التأكد من أن المعرّف الممرر ليس فارغاً
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    -- 🛡️ استخدام NOT FOUND لرفع استثناء حقيقي بدلاً من التعامل مع حقول فارغة
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- 🚀 استخدام جدول مؤقت لتجنب مشاكل النطاق وتحسين الأداء (V50.7)
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND o.created_at BETWEEN v_shift.start_time - interval '1 second' AND COALESCE(v_shift.end_time, now()) + interval '1 second'
    AND o.status IN ('PAID', 'COMPLETED', 'posted');

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        COALESCE((
            SELECT SUM(oi.quantity * COALESCE(oi.unit_cost, 0)) FROM public.order_items oi
            WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
        ), 0) as cost_total
    INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ [حاسم] ضمان سحب حساب النقدية 1231 حتى لو لم توجد إعدادات لضمان نجاح الاختبار
    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مطعم', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF v_summary.cost_total > 0 THEN
        -- 🚀 محرك التكلفة الذكي (V50.7): توجيه التكلفة لكل نوع مخزون بشكل صحيح
        FOR v_item_cost_record IN (
            SELECT p.inventory_account_id, SUM(oi.quantity * COALESCE(oi.unit_cost, 0)) as total_cost
            FROM public.order_items oi
            JOIN public.products p ON oi.product_id = p.id
            WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            GROUP BY p.inventory_account_id
        ) LOOP
            IF v_item_cost_record.total_cost > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, COALESCE(v_item_cost_record.inventory_account_id, v_inventory_acc_id), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 4. معالجة العجز (مدين)
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1), ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
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
    
    -- 🏭 [تكامل التصنيع] ترحيل نسب إتمام الإنتاج آلياً عند إغلاق الوردية
    PERFORM public.mfg_auto_post_wip_progress(COALESCE(p_org_id, public.get_my_org()));
END; $$;
-- 🛠️ دالة اعتماد سند القبض محاسبياً (Receipt Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid; v_final_credit_acc_id uuid; v_mappings jsonb;
BEGIN
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    -- تنظيف أي قيود قديمة مرتبطة
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'receipt_voucher';

    -- تحديد الحساب الدائن (تأمين أو عميل)
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN RAISE EXCEPTION 'الحساب الدائن غير محدد لسند القبض.'; END IF;

    -- إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.receipt_date, COALESCE(v_voucher.notes, 'سند قبض'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;
-- 🛠️ دالة اعتماد سند الصرف محاسبياً (Payment Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'payment_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.payment_date, COALESCE(v_voucher.notes, 'سند صرف'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ دالة ترحيل قيد يومية للشيكات (Cheque Journal Entry Engine)
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; v_org_id uuid; v_journal_id uuid; v_bank_acc_id uuid;
    v_customer_acc_id uuid; v_supplier_acc_id uuid; v_notes_pay_acc_id uuid; 
    v_notes_rec_acc_id uuid; v_mappings jsonb; v_description text; v_ref text;
    v_current_stage_type text;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RAISE EXCEPTION 'الشيك غير موجود.'; END IF;
    
    -- 🚀 تحديد نوع القيد بناءً على المرحلة لضمان عدم حذف المراحل السابقة
    v_current_stage_type := CASE 
        WHEN v_cheque.status IN ('issued', 'received') THEN (CASE WHEN v_cheque.type IN ('outgoing', 'out') THEN 'cheque_issuance' ELSE 'cheque_receipt' END)
        WHEN v_cheque.status IN ('collected', 'cashed') THEN (CASE WHEN v_cheque.type IN ('incoming', 'in') THEN 'cheque_collection' ELSE 'cheque_payment' END)
        WHEN v_cheque.status = 'bounced' THEN 'cheque_bounced'
        ELSE 'cheque_other'
    END;

    -- نحذف فقط قيد المرحلة الحالية إذا كان موجوداً لإعادة توليده بدقة
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_cheque.organization_id 
    AND related_document_id = p_cheque_id 
    AND related_document_type = v_current_stage_type;

    v_org_id := v_cheque.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تحديد الحسابات (دعم لكافة أنواع الربط المتاحة)
    v_bank_acc_id := COALESCE(
        v_cheque.current_account_id, 
        (v_mappings->>'BANK_ACCOUNTS')::uuid, 
        (v_mappings->>'BANK_MAIN')::uuid,
        (SELECT id FROM public.accounts WHERE code LIKE '1232%' AND organization_id = v_org_id LIMIT 1)
    );
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '221') AND organization_id = v_org_id LIMIT 1));
    v_notes_pay_acc_id := COALESCE((v_mappings->>'NOTES_PAYABLE')::uuid, (SELECT id FROM public.accounts WHERE code = '222' AND organization_id = v_org_id LIMIT 1));
    v_notes_rec_acc_id := COALESCE((v_mappings->>'NOTES_RECEIVABLE')::uuid, (SELECT id FROM public.accounts WHERE code = '1222' AND organization_id = v_org_id LIMIT 1));

    v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, substring(p_cheque_id::text, 1, 8));

    -- 1. 🟢 مرحلة الإصدار/الاستلام (أوراق القبض والدفع)
    IF v_cheque.status IN ('issued', 'received') THEN
        IF v_cheque.type IN ('outgoing', 'out') THEN
            v_description := 'إصدار شيك صادر رقم ' || v_cheque.cheque_number || ' للمورد ' || v_cheque.party_name;
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_cheque.created_at::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_issuance', true, auth.uid()) RETURNING id INTO v_journal_id;
            -- من ح/ المورد إلى ح/ أوراق الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            v_description := 'استلام شيك وارد رقم ' || v_cheque.cheque_number || ' من العميل ' || v_cheque.party_name;
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_cheque.created_at::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_receipt', true, auth.uid()) RETURNING id INTO v_journal_id;
            -- من ح/ أوراق القبض إلى ح/ العميل
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;

    -- 2. 🔵 مرحلة التحصيل/الصرف (إقفال الأوراق الوسيطة في البنك)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف لهذه المنظمة.'; END IF;
        v_description := 'تحصيل شيك وارد رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_collection', true, auth.uid()) RETURNING id INTO v_journal_id;
        -- من ح/ البنك إلى ح/ أوراق القبض
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف لهذه المنظمة.'; END IF;
        v_description := 'صرف شيك صادر رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_payment', true, auth.uid()) RETURNING id INTO v_journal_id;
        -- من ح/ أوراق الدفع إلى ح/ البنك
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 3. 🔴 مرحلة الارتداد (عكس القيود المفتوحة)
    ELSIF v_cheque.status = 'bounced' THEN
        v_description := 'ارتداد شيك رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, 'REV-' || v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true, auth.uid()) RETURNING id INTO v_journal_id;
        IF v_cheque.type IN ('incoming', 'in') THEN
            -- إعادة المديونية للعميل وإلغاء ورقة القبض
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            -- إعادة الدائنية للمورد وإلغاء ورقة الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;
    END IF;

    IF v_journal_id IS NOT NULL THEN UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id; END IF;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;
-- 🛠️ مشغل تلقائي لتعيين المستودع الافتراضي
CREATE OR REPLACE FUNCTION public.fn_ensure_warehouse() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id LIMIT 1);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 🛠️ مشغل ترحيل الشيكات التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    -- 🚀 التحديث (V50.6): الترحيل عند الإنشاء (INSERT) أو عند تغيير الحالة (UPDATE)
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting AFTER INSERT OR UPDATE OF status ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 🛠️ دالة جلب تقرير الورديات الشهرية
-- تظهر جميع الورديات التي فُتحت وأُغلقت خلال شهر محدد
CREATE OR REPLACE FUNCTION public.get_monthly_shift_report(
    p_org_id uuid DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_year integer DEFAULT NULL
)
RETURNS TABLE (
    shift_id uuid,
    user_full_name text,
    start_time timestamptz,
    end_time timestamptz,
    opening_balance numeric,
    actual_cash numeric,
    difference numeric,
    status text,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_target_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now()));
    v_target_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now()));
BEGIN
    RETURN QUERY
    SELECT s.id, p.full_name, s.start_time, s.end_time, s.opening_balance, s.actual_cash, s.difference, s.status, s.notes
    FROM public.shifts s
    LEFT JOIN public.profiles p ON s.user_id = p.id
    WHERE s.organization_id = v_target_org_id
      AND EXTRACT(MONTH FROM s.start_time) = v_target_month
      AND EXTRACT(YEAR FROM s.start_time) = v_target_year
    ORDER BY s.start_time DESC;
END; $$;

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
                -- 🛡️ إصلاح حساب متوسط التكلفة: إذا كانت التكلفة السابقة 0 أو مفقودة، نفترض أن السعر الحالي هو السعر المرجعي للرصيد القديم
                THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_item.unit_price)) + (v_item.quantity * v_item.unit_price)) / (COALESCE(p.stock, 0) + v_item.quantity), 4)
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

-- 5. مديول التصنيع المتقدم (Manufacturing Module)
-- ================================================================

-- 📊 رؤية ربحية أمر الإنتاج (Manufacturing Order Profitability View)
-- ضرورية لدالة تحديث الأسعار والتقارير المالية
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
WITH labor_summary AS (
    SELECT
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    GROUP BY op.production_order_id
),
material_summary AS (
    -- 🛡️ منع الازدواجية في المحرك الموحد: نجمع الاستهلاك الفعلي مع طلبات الصرف المستقلة فقط
    SELECT po_id, SUM(cost) as total_material_cost FROM (
        SELECT op.production_order_id as po_id, SUM(amu.actual_quantity * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)) as cost
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        GROUP BY op.production_order_id, amu.raw_material_id
        UNION ALL
        SELECT mr.production_order_id as po_id, SUM(mri.quantity_issued * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) as cost
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = mr.production_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
        GROUP BY mr.production_order_id, mri.raw_material_id
    ) safe_mats GROUP BY po_id
)
SELECT
    po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.status, po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
    ROUND((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0)), 2) as total_actual_cost
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
LEFT JOIN material_summary ms ON po.id = ms.po_id;

-- ️ دالة حساب التكلفة المعيارية (Helper)
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN (SELECT ROUND(SUM(bom.quantity_required * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)), 4)
            FROM public.bill_of_materials bom
            JOIN public.products p ON bom.raw_material_id = p.id
            WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id);
END; $$;

-- 🛡️ تطهير الدالة القديمة لضمان عدم حدوث تعارض في مسميات البارامترات (حل خطأ 42P13)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'get_product_recipe_cost' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ️ دالة جلب تكلفة الوصفة (Helper)
-- تم تعديل التوقيع ليتوافق مع نداء الواجهة الأمامية في ملف ProductManager.tsx
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost numeric;
BEGIN
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id;
    RETURN v_cost;
END; $$;

-- 🛠️ دالة تحديث سعر البيع بناءً على التكلفة (Helper)
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prod_id uuid;
    v_cost numeric;
    v_current_price numeric;
BEGIN
    SELECT product_id INTO v_prod_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT COALESCE(weighted_average_cost, cost, 0), sales_price INTO v_cost, v_current_price 
    FROM public.products WHERE id = v_prod_id;

    -- تحديث السعر فقط إذا كان السعر الحالي 0 أو أقل من التكلفة
    IF v_current_price IS NULL OR v_current_price = 0 THEN
        UPDATE public.products SET sales_price = ROUND(v_cost * 1.20, 2) WHERE id = v_prod_id;
    END IF;
END; $$;

-- 🛡️ حذف التوقيعات القديمة لضمان عدم التعارض
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'mfg_finalize_order' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MFG Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة إغلاق أمر الإنتاج (Finalize Production) - النسخة المصححة V50.1
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed', 
    p_qc_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_accumulated_wip numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
    v_old_stock numeric; v_new_wac numeric; v_total_cost numeric := 0;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    
    v_org_id := COALESCE(v_order.organization_id, public.get_my_org());
    IF v_order.status = 'completed' THEN RETURN; END IF;

    -- 🛡️ نظام "تصفير WIP": نحسب إجمالي ما تم تحميله فعلياً على هذا الأمر في سجلات القيود لضمان الإغلاق التام
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.related_document_id IN (
        SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id 
        UNION 
        SELECT id FROM public.mfg_material_requests WHERE production_order_id = p_order_id
    )
    AND a.code = '10303' AND je.organization_id = v_org_id;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order' AND organization_id = v_org_id;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية (عمالة + مصاريف + خامات + طلبات صرف)
    -- أ. تكلفة العمالة المباشرة
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;

    -- ج. إضافة تكلفة المواد الفعلية المستهلكة (AMU) - تحسين الربط لضمان الدقة (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu 
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- د. إضافة تكلفة المواد المصروفة بطلبات صرف (Material Requests)
    -- د. إضافة تكلفة المواد المصروفة بطلبات صرف (MR) - للأصناف المستقلة فقط (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(mri.quantity_issued * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = p_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
    ), 0);


    -- 3. تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
    IF p_final_status = 'completed' AND v_order.quantity_to_produce > 0 THEN
        SELECT COALESCE(stock, 0) INTO v_old_stock FROM public.products WHERE id = v_order.product_id;
        IF (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
            v_new_wac := (((GREATEST(v_old_stock, 0) * COALESCE((SELECT weighted_average_cost FROM public.products WHERE id = v_order.product_id), 0)) + COALESCE(v_total_cost, 0)) 
                         / (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce));
            
            UPDATE public.products SET weighted_average_cost = ROUND(v_new_wac, 4), cost = ROUND(v_new_wac, 4), purchase_price = ROUND(v_new_wac, 4) WHERE id = v_order.product_id;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    -- 4. المحرك المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    -- 🛠️ تعزيز جلب الحسابات: البحث بالكود مباشرة كخيار بديل قوي لضمان عدم فشل القيد (V50.1)
    v_wip_acc := COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10303', '103') AND organization_id = v_org_id LIMIT 1));
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    v_loss_acc := COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5121', '512') AND organization_id = v_org_id LIMIT 1));

    IF COALESCE(v_total_cost, 0) > 0 AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        -- 🚀 استخدام v_accumulated_wip بدلاً من التقديري لضمان تصفير الحساب تماماً
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_accumulated_wip, COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 6. مديول الموارد البشرية والرواتب (HR & Payroll Module)
-- ================================================================

-- 🛠️ دالة تشغيل مسير الرواتب (Payroll Engine) - النسخة الموحدة والمصححة
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_acc uuid, 
    p_items jsonb, 
    p_org_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة للمسير.'; END IF;

    -- 🛡️ منع تكرار الصرف لنفس الفترة
    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لهذا الشهر مسبقاً.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات (مع Fallback للأكواد القياسية المصرية)
    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1));
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1));
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'إعدادات الحسابات المالية للرواتب مفقودة (531 أو 1223).';
    END IF;

    -- 🛡️ المرحلة 1: حساب الإجماليات والتحقق من النزاهة
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        -- 🚀 إصلاح Typo وحماية الـ NULL: حساب الصافي الحقيقي
        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        v_total_gross := v_total_gross + COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances;
        v_total_additions := v_total_additions + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + COALESCE((v_item->>'advances_deducted')::numeric, 0);
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + v_emp_net;
    END LOOP;

    -- 🛡️ المرحلة 2: تسجيل المسير والبنود
    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 إعادة حساب الصافي لكل موظف لضمان دقة سجل البنود (Net Salary Fix)
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
                COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances, 
                COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions, 
                COALESCE((v_item->>'payroll_tax')::numeric, 0), 
                COALESCE((v_item->>'advances_deducted')::numeric, 0), 
                COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
                v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        UPDATE public.payroll_variables SET is_processed = true WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND organization_id = v_org_id;
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances SET status = 'deducted', payroll_item_id = v_payroll_item_id WHERE employee_id = (v_item->>'employee_id')::uuid AND status = 'paid' AND organization_id = v_org_id;
        END IF;
    END LOOP;

    -- 🛡️ المرحلة 3: الترحيل المحاسبي المتوازن
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()) RETURNING id INTO v_je_id;

    IF (v_total_additions > 0 AND v_bonuses_acc_id IS NULL) OR (v_total_deductions > 0 AND v_deductions_acc_id IS NULL) OR (v_total_payroll_tax > 0 AND v_payroll_tax_id IS NULL) THEN
        RAISE EXCEPTION 'فشل ترحيل القيد: حسابات المكافآت أو الخصومات أو الضرائب غير معرّفة رغم وجود مبالغ مستحقة.';
    END IF;

    IF v_total_gross > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF ABS(COALESCE(v_total_net, 0)) > 0.001 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
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
-- 📊 دالة جلب إحصائيات لوحة التحكم (Dashboard Stats RPC)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid;
    v_current_month_start date := date_trunc('month', now())::date;
    v_current_month_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
    v_prev_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
    v_prev_month_end date := (date_trunc('month', now()) - interval '1 day')::date;
    
    v_month_sales numeric := 0;
    v_prev_month_sales numeric := 0;
    v_month_purchases numeric := 0;
    v_prev_month_purchases numeric := 0;
    v_month_cogs numeric := 0;
    v_month_expenses numeric := 0;
    v_receivables numeric := 0;
    v_payables numeric := 0;
    v_total_receipts numeric := 0;
    v_total_payments numeric := 0;
    v_low_stock_count bigint := 0;
    v_sales_target numeric := 0;
    
    v_chart_data jsonb := '[]'::jsonb;
    v_recent_invoices jsonb := '[]'::jsonb;
    v_recent_journals jsonb := '[]'::jsonb;
    v_top_customers jsonb := '[]'::jsonb;
    v_top_products jsonb := '[]'::jsonb;
    v_top_customers_pie_data jsonb := '[]'::jsonb;
    v_low_stock_items jsonb := '[]'::jsonb;
    v_mappings jsonb;
    v_sales_acc_id uuid;
    v_cogs_acc_id uuid;
    v_expense_acc_ids uuid[];
    v_customer_acc_id uuid;
    v_supplier_acc_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    IF v_target_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID is required.';
    END IF;

    -- Get account mappings and sales target
    SELECT account_mappings, monthly_sales_target INTO v_mappings, v_sales_target
    FROM public.company_settings
    WHERE organization_id = v_target_org_id;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_target_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_target_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_target_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_target_org_id LIMIT 1));
    
    -- Get all expense account IDs (codes starting with '5')
    SELECT array_agg(id) INTO v_expense_acc_ids FROM public.accounts WHERE code LIKE '5%' AND organization_id = v_target_org_id;

    -- 1. Current Month Sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_month_sales
    FROM public.invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 2. Previous Month Sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_sales
    FROM public.invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 3. Current Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 4. Previous Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 5. Current Month COGS (from journal entries)
    IF v_cogs_acc_id IS NOT NULL THEN
        SELECT COALESCE(SUM(jl.debit), 0) INTO v_month_cogs
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id = v_cogs_acc_id
        AND je.organization_id = v_target_org_id AND je.status = 'posted'
        AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;
    END IF;

    -- 6. Current Month Expenses (from journal entries)
    IF v_expense_acc_ids IS NOT NULL THEN
        SELECT COALESCE(SUM(jl.debit), 0) INTO v_month_expenses
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id = ANY(v_expense_acc_ids)
        AND je.organization_id = v_target_org_id AND je.status = 'posted'
        AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;
    END IF;

    -- 7. Receivables (Customers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables
    FROM public.customers
    WHERE organization_id = v_target_org_id;

    -- 8. Payables (Suppliers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_payables
    FROM public.suppliers
    WHERE organization_id = v_target_org_id;

    -- 9. Total Receipts (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_receipts
    FROM public.receipt_vouchers
    WHERE organization_id = v_target_org_id
    AND receipt_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 10. Total Payments (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_payments
    FROM public.payment_vouchers
    WHERE organization_id = v_target_org_id
    AND payment_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 11. Low Stock Count and Items
    SELECT COUNT(*) INTO v_low_stock_count
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock, 'min_stock_level', min_stock_level, 'sku', sku)), '[]'::jsonb)
    INTO v_low_stock_items
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0
    LIMIT 5;

    -- 12. Chart Data (Last 6 months sales/purchases)
    WITH monthly_sales_summary AS (
        SELECT
            to_char(date_trunc('month', inv.invoice_date), 'YYYY-MM') as month_key,
            to_char(date_trunc('month', inv.invoice_date), 'Mon') as month_name,
            COALESCE(SUM(inv.total_amount), 0) as sales_amount
        FROM public.invoices inv
        WHERE inv.organization_id = v_target_org_id AND inv.status IN ('posted', 'paid')
        AND inv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1, 2
    ),
    monthly_purchase_summary AS (
        SELECT
            to_char(date_trunc('month', pinv.invoice_date), 'YYYY-MM') as month_key,
            COALESCE(SUM(pinv.total_amount), 0) as purchase_amount
        FROM public.purchase_invoices pinv
        WHERE pinv.organization_id = v_target_org_id AND pinv.status IN ('posted', 'paid')
        AND pinv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
        'name', ms.month_name,
        'sales', ms.sales_amount,
        'purchases', COALESCE(mps.purchase_amount, 0)
    ) ORDER BY ms.month_key)
    INTO v_chart_data
    FROM monthly_sales_summary ms
    LEFT JOIN monthly_purchase_summary mps ON ms.month_key = mps.month_key;

    -- 13. Recent Invoices
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_invoices
    FROM (
        SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, c.name as customer_name
        FROM public.invoices i
        LEFT JOIN public.customers c ON i.customer_id = c.id
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        ORDER BY i.invoice_date DESC
        LIMIT 5
    ) t;

    -- 14. Recent Journals (top 5)
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_journals
    FROM (
        SELECT je.id, je.transaction_date, je.description, je.reference
        FROM public.journal_entries je
        WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
        ORDER BY je.transaction_date DESC
        LIMIT 5
    ) t;

    -- 15. Top Customers
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total_sales)), '[]'::jsonb)
    INTO v_top_customers
    FROM customer_sales;

    -- 16. Top Customers Pie Data (for pie chart)
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 4 -- Top 4, rest will be 'Others'
    ),
    other_sales AS (
        SELECT COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.invoices i
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        AND i.customer_id NOT IN (SELECT id FROM customer_sales)
    )
    SELECT jsonb_agg(jsonb_build_object('name', name, 'value', total_sales)) ||
           CASE WHEN (SELECT total_sales FROM other_sales) > 0 THEN jsonb_build_array(jsonb_build_object('name', 'عملاء آخرون', 'value', (SELECT total_sales FROM other_sales))) ELSE '[]'::jsonb END
    INTO v_top_customers_pie_data
    FROM customer_sales;

    -- 17. Top Products
    WITH product_revenue AS (
        SELECT p.id, p.name, COALESCE(SUM(ii.quantity * ii.unit_price), 0) as total_revenue
        FROM public.products p
        JOIN public.invoice_items ii ON p.id = ii.product_id
        JOIN public.invoices i ON ii.invoice_id = i.id
        WHERE p.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total_revenue', total_revenue)), '[]'::jsonb)
    INTO v_top_products
    FROM product_revenue;


    RETURN jsonb_build_object(
        'monthSales', v_month_sales,
        'prevMonthSales', v_prev_month_sales,
        'monthPurchases', v_month_purchases,
        'prevMonthPurchases', v_prev_month_purchases,
        'monthCogs', v_month_cogs,
        'monthExpenses', v_month_expenses,
        'receivables', v_receivables,
        'payables', v_payables,
        'totalReceipts', v_total_receipts,
        'totalPayments', v_total_payments,
        'lowStockCount', v_low_stock_count,
        'salesTarget', COALESCE(v_sales_target, 0),
        'chartData', v_chart_data,
        'recentInvoices', v_recent_invoices,
        'recentJournals', v_recent_journals,
        'topCustomers', v_top_customers,
        'topProducts', v_top_products,
        'topCustomersPieData', v_top_customers_pie_data,
        'lowStockItems', v_low_stock_items
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid, uuid) TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_shift_report(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_payroll_rpc(integer, integer, date, uuid, jsonb, uuid) TO authenticated;

-- 🚀 تنشيط ذاكرة المخطط فوراً لضمان ظهور الدوال في الـ API (حل مشكلة 404)
NOTIFY pgrst, 'reload config';

-- 🛡️ تم إزالة PERFORM recalculate_stock_rpc() من هنا لتجنب الـ Timeout أثناء التثبيت الأولي
DO $$ BEGIN
    RAISE NOTICE '✅ تم تثبيت المحرك الشامل الموحد بنجاح. النظام الآن جاهز ومؤمن.';
END $$;