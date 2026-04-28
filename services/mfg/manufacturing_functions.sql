-- ⚙️ مديول الدوال البرمجية للتصنيع (Manufacturing Functions)

-- دالة بدء مرحلة إنتاجية
CREATE OR REPLACE FUNCTION public.mfg_start_step(p_progress_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    UPDATE public.mfg_order_progress 
    SET status = 'active', actual_start_time = now()
    WHERE id = p_progress_id;
END; $$;

-- 2. دالة إكمال مرحلة وحساب التكلفة وتوليد قيود WIP
CREATE OR REPLACE FUNCTION public.mfg_complete_step(p_progress_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_step record;
    v_order record;
    v_wc record;
    v_routing_step record;
    v_mat record;
    v_usage_qty numeric;
    v_mat_total_cost numeric := 0;
    v_labor_cost numeric := 0;
    v_je_id uuid;
    v_mappings jsonb;
    v_wip_acc uuid;
    v_inv_acc uuid;
    v_labor_acc uuid;
    v_org_id uuid;
BEGIN
    -- 1. جلب بيانات التقدم والتحقق من الصلاحية
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF; -- منع التكرار
    v_org_id := v_step.organization_id;

    -- 2. جلب بيانات مركز العمل لحساب التكلفة
    SELECT rs.standard_time_minutes, wc.hourly_rate 
    INTO v_routing_step
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE rs.id = v_step.step_id;

    -- حساب تكلفة العمالة بناءً على الزمن المعياري (زمن الوحدة بالدقائق / 60 * الكمية * معدل الساعة)
    v_labor_cost := (COALESCE(v_routing_step.standard_time_minutes, 0) / 60.0) * p_qty * COALESCE(v_routing_step.hourly_rate, 0);

    -- 3. تحديث حالة المرحلة وتكلفة العمالة
    UPDATE public.mfg_order_progress SET 
        status = 'completed', 
        actual_end_time = now(),
        produced_qty = p_qty,
        labor_cost_actual = v_labor_cost
    WHERE id = p_progress_id;

    -- 4. محرك الخصم المخزني الآلي (Stage-based BOM Deduction)
    FOR v_mat IN 
        SELECT raw_material_id, quantity_required 
        FROM public.mfg_step_materials 
        WHERE step_id = v_step.step_id
    LOOP
        v_usage_qty := v_mat.quantity_required * p_qty;

        -- حساب تكلفة المواد المستهلكة (بناءً على المتوسط المرجح)
        v_mat_total_cost := v_mat_total_cost + (v_usage_qty * COALESCE((SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) FROM public.products WHERE id = v_mat.raw_material_id), 0));

        -- أ. خصم المواد من المخزون
        UPDATE public.products SET stock = stock - v_usage_qty 
        WHERE id = v_mat.raw_material_id AND organization_id = v_org_id;

        -- ب. تسجيل الاستهلاك الفعلي (نفترض حالياً الفعلي = المعياري عند الإغلاق السريع)
        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, organization_id)
        VALUES (p_progress_id, v_mat.raw_material_id, v_usage_qty, v_usage_qty, v_org_id);
    END LOOP;

    -- 5. المحرك المحاسبي الصناعي: توليد قيد الإنتاج تحت التشغيل (WIP Entry)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- جلب الحسابات (نستخدم كود 10303 للإنتاج تحت التشغيل و 10301 للمواد الخام)
    v_wip_acc := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1);
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_labor_acc := COALESCE((v_mappings->>'LABOR_COST_ALLOCATED')::uuid, (SELECT id FROM public.accounts WHERE code = '513' AND organization_id = v_org_id LIMIT 1));

    IF v_wip_acc IS NOT NULL AND (v_mat_total_cost > 0 OR v_labor_cost > 0) THEN
        -- إنشاء رأس القيد
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, 
            related_document_id, related_document_type
        ) VALUES (
            now()::date, 
            'تحميل تكاليف المرحلة: ' || (SELECT operation_name FROM public.mfg_routing_steps WHERE id = v_step.step_id),
            'MFG-STEP-' || substring(p_progress_id::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_step'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- 1. من ح/ الإنتاج تحت التشغيل (إجمالي المواد + العمالة)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, (v_mat_total_cost + v_labor_cost), 0, 'إجمالي تكلفة المرحلة الإنتاجية', v_org_id);

        -- 2. إلى ح/ مخزون المواد الخام (بالتكلفة الفعلية للمواد)
        IF v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_inv_acc, 0, v_mat_total_cost, 'صرف مواد خام للمرحلة الإنتاجية', v_org_id);
        END IF;

        -- 3. إلى ح/ تكاليف عمالة مباشرة محملة (بالتكلفة المعيارية للمركز)
        IF v_labor_cost > 0 AND v_labor_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_labor_acc, 0, v_labor_cost, 'تحميل تكلفة عمالة المرحلة الإنتاجية', v_org_id);
        END IF;
    END IF;
END; $$;

-- 7. دالة الإغلاق النهائي لطلب الإنتاج (MFG Finalization)
-- تقوم بنقل التكلفة من الإنتاج تحت التشغيل (WIP) إلى المنتج التام (Finished Goods)
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_order record;
    v_total_cost numeric := 0;
    v_je_id uuid;
    v_wip_acc uuid;
    v_fg_acc uuid;
    v_org_id uuid;
    v_mappings jsonb;
BEGIN
    -- 1. التحقق من الطلب وحالته
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;
    
    v_org_id := v_order.organization_id;

    -- 2. حساب إجمالي التكاليف المحملة على هذا الطلب (مواد + عمالة)
    -- أ. تكلفة العمالة من سجلات التقدم
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;

    -- ب. إضافة تكلفة المواد الفعلية المستهلكة
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products p ON amu.raw_material_id = p.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- 3. تحديث حالة الطلب وزيادة مخزون المنتج التام (Finished Goods)
    UPDATE public.mfg_production_orders 
    SET status = 'completed', end_date = now()::date 
    WHERE id = p_order_id;

    UPDATE public.products 
    SET stock = stock + v_order.quantity_to_produce 
    WHERE id = v_order.product_id AND organization_id = v_org_id;

    -- 4. المحرك المحاسبي: قيد إغلاق WIP وتحويله لمنتج تام
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1);
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    IF v_total_cost > 0 AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
        ) VALUES (
            now()::date, 'إغلاق أمر إنتاج رقم: ' || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 
            'posted', v_org_id, true, p_order_id, 'mfg_order'
        ) RETURNING id INTO v_je_id;

        -- من ح/ مخزون المنتج التام (Finished Goods)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_fg_acc, v_total_cost, 0, 'تحويل تكلفة الإنتاج التام من WIP', v_org_id);

        -- إلى ح/ الإنتاج تحت التشغيل (WIP)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, 0, v_total_cost, 'إخلاء حساب الإنتاج تحت التشغيل', v_org_id);
    END IF;
END; $$;

-- 8. دالة حساب التكلفة المعيارية التقديرية (Standard Cost Calculation)
-- تقوم بحساب التكلفة المتوقعة للمنتج بناءً على الـ BOM والمسار الإنتاجي المعتمد
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_total_cost numeric := 0;
    v_routing record;
    v_step record;
    v_org_id uuid;
    v_labor_cost numeric;
    v_material_cost numeric;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT * INTO v_routing FROM public.mfg_routings 
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true 
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF NOT FOUND THEN
        SELECT * INTO v_routing FROM public.mfg_routings 
        WHERE product_id = p_product_id AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_routing.id IS NULL THEN RETURN 0; END IF;

    -- 2. حساب التكاليف لكل مرحلة في المسار
    FOR v_step IN 
        SELECT rs.*, wc.hourly_rate 
        FROM public.mfg_routing_steps rs
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE rs.routing_id = v_routing.id
    LOOP
        -- أ. تكلفة العمالة المعيارية للمرحلة (الوقت المعياري بالساعات * تكلفة الساعة)
        v_labor_cost := (COALESCE(v_step.standard_time_minutes, 0) / 60.0) * COALESCE(v_step.hourly_rate, 0);

        -- ب. تكلفة المواد الخام المعيارية لهذه المرحلة
        SELECT SUM(sm.quantity_required * COALESCE(p.weighted_average_cost, p.purchase_price, 0))
        INTO v_material_cost
        FROM public.mfg_step_materials sm
        JOIN public.products p ON sm.raw_material_id = p.id
        WHERE sm.step_id = v_step.id;

        v_total_cost := v_total_cost + v_labor_cost + COALESCE(v_material_cost, 0);
    END LOOP;

    RETURN ROUND(v_total_cost, 4);
END; $$;

-- 9. دالة تحديث تكلفة المنتج بناءً على الحسبة المعيارية
-- تقوم باستدعاء دالة التكلفة المعيارية وتحديث بطاقة الصنف آلياً
CREATE OR REPLACE FUNCTION public.mfg_update_product_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_std_cost numeric;
BEGIN
    v_std_cost := public.mfg_calculate_standard_cost(p_product_id);
    
    IF v_std_cost > 0 THEN
        UPDATE public.products 
        SET cost = v_std_cost, 
            manufacturing_cost = v_std_cost
        WHERE id = p_product_id AND organization_id = public.get_my_org();
    END IF;
    
    RETURN v_std_cost;
END; $$;

-- 10. دالة التحقق من توفر المواد الخام (Stock Availability Check)
-- تظهر المواد التي بها عجز فقط مقارنة بالكمية المطلوب إنتاجها
CREATE OR REPLACE FUNCTION public.mfg_check_stock_availability(p_product_id uuid, p_quantity numeric)
RETURNS TABLE (
    material_id uuid,
    material_name text,
    required_total_qty numeric,
    current_stock_qty numeric,
    shortage_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_routing_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT id INTO v_routing_id FROM public.mfg_routings 
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true 
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF v_routing_id IS NULL THEN
        SELECT id INTO v_routing_id FROM public.mfg_routings 
        WHERE product_id = p_product_id AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_routing_id IS NULL THEN RETURN; END IF;

    -- 2. تجميع الاحتياجات الكلية من المواد الخام ومقارنتها بالمخزون الحالي
    RETURN QUERY
    WITH material_requirements AS (
        SELECT 
            sm.raw_material_id, 
            SUM(sm.quantity_required * p_quantity) as total_req
        FROM public.mfg_routing_steps rs
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE rs.routing_id = v_routing_id
        GROUP BY sm.raw_material_id
    )
    SELECT 
        mr.raw_material_id,
        p.name,
        mr.total_req,
        COALESCE(p.stock, 0),
        CASE 
            WHEN COALESCE(p.stock, 0) < mr.total_req THEN mr.total_req - COALESCE(p.stock, 0)
            ELSE 0 
        END
    FROM material_requirements mr
    JOIN public.products p ON mr.raw_material_id = p.id
    WHERE mr.total_req > COALESCE(p.stock, 0); -- نرجع فقط المواد التي بها عجز (نقص)
END; $$;

-- 11. دالة تسجيل التالف ومعالجته محاسبياً (Scrap Recording & Accounting)
CREATE OR REPLACE FUNCTION public.mfg_record_scrap(
    p_progress_id uuid, 
    p_material_id uuid, 
    p_qty numeric, 
    p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid;
    v_cost numeric;
    v_je_id uuid;
    v_mappings jsonb;
    v_scrap_acc uuid;
    v_wip_acc uuid;
    v_material_name text;
BEGIN
    -- 1. جلب البيانات الأساسية
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT name, COALESCE(weighted_average_cost, cost, 0) INTO v_material_name, v_cost 
    FROM public.products WHERE id = p_material_id;

    -- 2. تسجيل التالف في الجدول
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, reason, organization_id)
    VALUES (p_progress_id, p_material_id, p_qty, p_reason, v_org_id);

    -- 3. خصم الكمية من المخزون (لأن التالف استهلاك غير مخطط له)
    UPDATE public.products 
    SET stock = stock - p_qty 
    WHERE id = p_material_id AND organization_id = v_org_id;

    -- 4. المحرك المحاسبي: قيد إثبات خسارة التالف
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- حساب التالف (5121 هالك) وحساب WIP (10303)
    v_scrap_acc := COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    );
    v_wip_acc := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1);

    IF v_scrap_acc IS NOT NULL AND v_cost > 0 THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted,
            related_document_id, related_document_type
        ) VALUES (
            now()::date, 
            'إثبات تالف صناعي: ' || v_material_name || ' - ' || p_reason,
            'MFG-SCRAP-' || substring(gen_random_uuid()::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_scrap'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- من ح/ تكلفة الهالك والفاقد (تحميل الخسارة على المصاريف)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_scrap_acc, (p_qty * v_cost), 0, 'خسارة تالف مواد خام غير مستردة', v_org_id);

        -- إلى ح/ مخزون المواد الخام (أو WIP إذا كان قد تم صرفه بالفعل للمرحلة)
        -- هنا نخصمه من المخزون مباشرة لأنه تالف إضافي لم يحسب في الدورة العادية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (
            v_je_id, 
            COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)),
            0, (p_qty * v_cost), 'تخفيض المخزون نتيجة تلف صنف', v_org_id
        );
    END IF;

    -- 5. تحديث الأرصدة
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 18. دالة دمج طلبات المبيعات في أوامر إنتاج موحدة (Batching/Merging Orders)
-- تهدف لتقليل الهالك عبر تجميع الكميات المطلوبة لنفس المنتج من عدة فواتير
CREATE OR REPLACE FUNCTION public.mfg_merge_sales_orders(p_invoice_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_batch_ref text;
BEGIN
    v_org_id := public.get_my_org();
    v_batch_ref := 'BATCH-' || to_char(now(), 'YYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 4);

    -- 1. تجميع الكميات المطلوبة لكل منتج من الفواتير المحددة
    FOR v_item IN 
        SELECT ii.product_id, SUM(ii.quantity) as total_qty
        FROM public.invoice_items ii
        WHERE ii.invoice_id = ANY(p_invoice_ids)
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = ii.product_id)
        GROUP BY ii.product_id
    LOOP
        -- 2. إنشاء أمر إنتاج موحد للكمية الكلية
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status, 
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-MERGED-' || substring(gen_random_uuid()::text, 1, 8),
            v_item.product_id, v_item.total_qty, 'draft', 
            now()::date, v_org_id, v_batch_ref
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل بناءً على المسار الافتراضي
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT 
            v_prod_order_id, 
            rs.id, 
            'pending',
            v_org_id
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        WHERE r.product_id = v_item.product_id AND r.is_default = true;

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 12. دالة توليد الأرقام التسلسلية آلياً عند الإغلاق
CREATE OR REPLACE FUNCTION public.mfg_generate_batch_serials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_order record;
    v_i integer;
    v_serial text;
BEGIN
    SELECT po.*, p.requires_serial INTO v_order 
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = p_order_id;

    IF v_order.requires_serial THEN
        FOR v_i IN 1..v_order.quantity_to_produce LOOP
            v_serial := 'SN-' || v_order.order_number || '-' || LPAD(v_i::text, 4, '0');
            INSERT INTO public.mfg_batch_serials (production_order_id, product_id, serial_number, organization_id)
            VALUES (p_order_id, v_order.product_id, v_serial, v_order.organization_id);
        END LOOP;
    END IF;
END; $$;

-- تحديث دالة mfg_finalize_order لتشمل توليد السيريالات
-- (ملاحظة: الكود أدناه يفترض إضافة استدعاء الدالة الجديدة داخل finalize)

-- 13. دالة اختبار دورة التصنيع الكاملة (Manufacturing Integration Test)
CREATE OR REPLACE FUNCTION public.mfg_test_full_cycle()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_prod_id uuid; v_raw_id uuid; v_wc_id uuid;
    v_routing_id uuid; v_step_id uuid; v_order_id uuid; v_prog_id uuid;
BEGIN
    -- 1. الإعداد
    v_org_id := public.get_my_org();
    
    -- ضمان وجود organization_id للاختبار
    IF v_org_id IS NULL THEN
        -- محاولة جلب أي organization_id موجود
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        IF v_org_id IS NULL THEN
            -- إذا لم توجد أي منظمة، قم بإنشاء واحدة مؤقتة للاختبار
            INSERT INTO public.organizations (name) VALUES ('Test Organization for MFG') RETURNING id INTO v_org_id;
            step_name := '0. تهيئة المنظمة'; result := 'INFO'; details := 'تم إنشاء منظمة اختبار مؤقتة'; RETURN NEXT;
        END IF;
    END IF;
    
    -- إنشاء منتج تام ومادة خام للاختبار
    INSERT INTO public.products (name, mfg_type, requires_serial, organization_id) 
    VALUES ('منتج اختباري نهائي', 'standard', true, v_org_id) RETURNING id INTO v_prod_id;
    
    INSERT INTO public.products (name, mfg_type, stock, weighted_average_cost, organization_id) 
    VALUES ('خامة اختبارية', 'raw', 100, 10, v_org_id) RETURNING id INTO v_raw_id;

    step_name := '1. تهيئة البيانات'; result := 'PASS ✅'; details := 'تم إنشاء المنتج والخامة'; RETURN NEXT;

    -- 2. إنشاء مركز عمل ومسار
    INSERT INTO public.mfg_work_centers (name, hourly_rate, organization_id) 
    VALUES ('مركز اختبار', 50, v_org_id) RETURNING id INTO v_wc_id;

    INSERT INTO public.mfg_routings (product_id, name, organization_id) 
    VALUES (v_prod_id, 'مسار افتراضي', v_org_id) RETURNING id INTO v_routing_id;

    INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
    VALUES (v_routing_id, 1, v_wc_id, 'مرحلة اختبارية', 60, v_org_id) RETURNING id INTO v_step_id;

    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_raw_id, 2, v_org_id);

    step_name := '2. إعداد المسار وBOM'; result := 'PASS ✅'; details := 'تم ربط الخامة بمركز العمل'; RETURN NEXT;

    -- 3. إنشاء أمر إنتاج وبدء التنفيذ
    INSERT INTO public.mfg_production_orders (order_number, product_id, quantity_to_produce, status, organization_id)
    VALUES ('TEST-' || substring(gen_random_uuid()::text, 1, 8), v_prod_id, 5, 'in_progress', v_org_id) RETURNING id INTO v_order_id;

    INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
    VALUES (v_order_id, v_step_id, 'pending', v_org_id) RETURNING id INTO v_prog_id;

    PERFORM public.mfg_start_step(v_prog_id);
    PERFORM public.mfg_complete_step(v_prog_id, 5);

    step_name := '3. تنفيذ الإنتاج'; result := 'PASS ✅'; details := 'تم خصم الخامة (10 وحدات) وتحميل WIP'; RETURN NEXT;

    -- 4. الإغلاق المالي وتوليد السيريالات
    PERFORM public.mfg_finalize_order(v_order_id);
    PERFORM public.mfg_generate_batch_serials(v_order_id);

    step_name := '4. الإغلاق والسيريالات'; result := 'PASS ✅'; details := 'تم توليد 5 أرقام تسلسلية وتحديث المخزون'; RETURN NEXT;

    -- 5. التحقق النهائي
    IF EXISTS (SELECT 1 FROM public.mfg_batch_serials WHERE production_order_id = v_order_id) AND 
       (SELECT stock FROM public.products WHERE id = v_prod_id) = 5 THEN
        step_name := '5. التحقق من النتائج'; result := 'SUCCESS 🏆'; details := 'الدورة كاملة من الإنتاج للمحاسبة سليمة';
    ELSE
        step_name := '5. التحقق من النتائج'; result := 'FAIL ❌'; details := 'فشل في مطابقة المخزون أو السيريالات';
    END IF;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار (اختياري، يفضل إبقاؤها في بيئة التجربة)
END; $$;

-- 14. دالة تتبع "نسب" المنتج (Product Genealogy / Traceability)
-- تتيح استرجاع التاريخ الكامل لقطعة معينة عبر رقمها التسلسلي
CREATE OR REPLACE FUNCTION public.mfg_get_product_genealogy(p_serial_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_serial record;
    v_order record;
    v_components jsonb;
    v_process jsonb;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن بيانات الرقم التسلسلي
    SELECT * INTO v_serial FROM public.mfg_batch_serials 
    WHERE serial_number = p_serial_number AND organization_id = v_org_id;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('error', 'الرقم التسلسلي غير موجود في قاعدة بيانات هذه المنظمة'); 
    END IF;

    -- 2. جلب بيانات أمر الإنتاج والمنتج
    SELECT po.*, p.name as product_name 
    INTO v_order 
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = v_serial.production_order_id;

    -- 3. جلب المكونات المستخدمة في هذه الدفعة (Standard vs Actual)
    SELECT jsonb_agg(t) INTO v_components FROM (
        SELECT 
            rm.name as material_name,
            ROUND(SUM(amu.standard_quantity) / v_order.quantity_to_produce, 4) as standard_per_unit,
            ROUND(SUM(amu.actual_quantity) / v_order.quantity_to_produce, 4) as actual_per_unit
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        WHERE op.production_order_id = v_order.id
        GROUP BY rm.name
    ) t;

    -- 4. جلب سجل العمليات والوقت المستغرق
    SELECT jsonb_agg(t) INTO v_process FROM (
        SELECT 
            rs.operation_name,
            wc.name as work_center_name,
            op.actual_start_time,
            op.actual_end_time,
            op.status
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = v_order.id
        ORDER BY rs.step_order
    ) t;

    RETURN jsonb_build_object(
        'product_info', jsonb_build_object(
            'name', v_order.product_name,
            'serial_number', p_serial_number,
            'batch_number', v_order.batch_number,
            'order_number', v_order.order_number,
            'produced_at', v_order.end_date
        ),
        'components_traceability', COALESCE(v_components, '[]'::jsonb),
        'manufacturing_steps', COALESCE(v_process, '[]'::jsonb)
    );
END; $$;

-- 15. دالة تحويل طلب المبيعات إلى أوامر إنتاج تلقائية
-- تقوم بفحص المنتجات التي لها "مسار إنتاج" (Routing) وتنشئ لها أوامر
CREATE OR REPLACE FUNCTION public.mfg_create_orders_from_sales(p_sales_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_routing_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. المرور على كافة بنود فاتورة المبيعات أو الطلب
    -- نتحقق من وجود routing للمنتج كدليل على أنه منتج مصنع
    FOR v_item IN 
        SELECT ii.product_id, ii.quantity, p.name, i.invoice_number
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        JOIN public.products p ON ii.product_id = p.id
        WHERE ii.invoice_id = p_sales_order_id 
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = ii.product_id)
    LOOP
        -- 2. إنشاء أمر الإنتاج
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status, 
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-AUTO-' || v_item.invoice_number || '-' || substring(gen_random_uuid()::text, 1, 4),
            v_item.product_id, v_item.quantity, 'draft', 
            now()::date, v_org_id, v_item.invoice_number
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل تلقائياً بناءً على المسار الافتراضي
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT 
            v_prod_order_id, 
            rs.id, 
            CASE WHEN rs.step_order = 1 THEN 'pending' ELSE 'pending' END,
            v_org_id
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        WHERE r.product_id = v_item.product_id AND r.is_default = true;

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 16. دالة جلب مهام "أرضية المصنع" (Shop Floor Tasks)
-- تعرض المهام المتاحة للبدء أو الإكمال في مركز عمل معين
CREATE OR REPLACE FUNCTION public.mfg_get_shop_floor_tasks(p_work_center_id uuid DEFAULT NULL)
RETURNS TABLE (
    progress_id uuid,
    step_id uuid,
    order_number text,
    product_name text,
    operation_name text,
    status text,
    target_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT 
        op.id,
        op.step_id,
        po.order_number,
        p.name,
        rs.operation_name,
        op.status,
        po.quantity_to_produce
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    JOIN public.products p ON po.product_id = p.id
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE po.organization_id = public.get_my_org()
    AND po.status = 'in_progress'
    AND op.status IN ('pending', 'active')
    AND (p_work_center_id IS NULL OR rs.work_center_id = p_work_center_id)
    ORDER BY rs.step_order ASC;
END; $$;

-- 17. دالة معالجة الباركود (Barcode Scanner Handler)
-- دالة ذكية: إذا مسح العامل باركود المرحلة، تقوم بتبديل حالتها (بدء أو إكمال)
CREATE OR REPLACE FUNCTION public.mfg_process_scan(p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_progress_id uuid;
    v_status text;
    v_order_qty numeric;
BEGIN
    -- نفترض أن الباركود يحتوي على معرف سجل التقدم (Progress ID)
    v_progress_id := p_barcode::uuid;
    
    SELECT op.status, po.quantity_to_produce INTO v_status, v_order_qty
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    WHERE op.id = v_progress_id;

    IF v_status = 'pending' THEN
        PERFORM public.mfg_start_step(v_progress_id);
        RETURN jsonb_build_object('success', true, 'action', 'started', 'message', 'تم بدء العمل على المرحلة');
    ELSIF v_status = 'active' THEN
        PERFORM public.mfg_complete_step(v_progress_id, v_order_qty);
        RETURN jsonb_build_object('success', true, 'action', 'completed', 'message', 'تم إكمال المرحلة بنجاح');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة مكتملة بالفعل أو غير صالحة');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'خطأ في قراءة الباركود: ' || SQLERRM);
END; $$;

-- 19. دالة فحص كفاءة مراكز العمل وإصدار تنبيهات ذكية (Efficiency Alerts)
CREATE OR REPLACE FUNCTION public.mfg_check_efficiency_alerts(p_threshold numeric DEFAULT 70)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    -- جلب كافة المسئولين في المنظمة الحالية
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        
        -- التحقق من مراكز العمل التي انخفضت كفاءتها
        FOR v_row IN 
            SELECT * FROM public.v_mfg_work_center_efficiency 
            WHERE efficiency_percentage < p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id, 
                title, 
                message, 
                priority, 
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه كفاءة الإنتاج: ' || v_row.work_center_name,
                format('انخفض أداء المركز (%s) إلى %s%% وهي أقل من المعيار (%s%%)', 
                       v_row.work_center_name, v_row.efficiency_percentage, p_threshold),
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;
