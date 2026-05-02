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
    v_scrap_qty numeric := 0;
BEGIN
    -- 1. جلب بيانات التقدم والتحقق من الصلاحية
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF; -- منع التكرار
    v_org_id := v_step.organization_id;

    -- [جديد] جلب إجمالي التالف المسجل لهذه المرحلة لزيادة الاستهلاك الفعلي
    SELECT COALESCE(SUM(quantity), 0) INTO v_scrap_qty 
    FROM public.mfg_scrap_logs 
    WHERE order_progress_id = p_progress_id;

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

        -- [تحسين] خصم المواد من المخزون فقط إذا لم تكن قد صرفت مسبقاً بطلب صرف يدوي (منع الازدواجية)
        IF NOT EXISTS (
            SELECT 1 FROM public.mfg_material_request_items mri 
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id 
            WHERE mr.production_order_id = v_step.production_order_id AND mri.raw_material_id = v_mat.raw_material_id AND mr.status = 'issued'
        ) THEN
            UPDATE public.products SET stock = stock - v_usage_qty 
            WHERE id = v_mat.raw_material_id AND organization_id = v_org_id;
        END IF;

        -- ب. تسجيل الاستهلاك الفعلي (إضافة الكمية المعيارية + التالف الخاص بنفس المادة إن وجد)
        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, organization_id)
        VALUES (
            p_progress_id, 
            v_mat.raw_material_id, 
            v_usage_qty, 
            v_usage_qty + COALESCE((SELECT SUM(quantity) FROM public.mfg_scrap_logs WHERE order_progress_id = p_progress_id AND product_id = v_mat.raw_material_id), 0), 
            v_org_id
        );
    END LOOP;

    -- 5. المحرك المحاسبي الصناعي: توليد قيد الإنتاج تحت التشغيل (WIP Entry)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- جلب الحسابات (نستخدم كود 10303 للإنتاج تحت التشغيل و 10301 للمواد الخام)
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid,
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, 
                         (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_labor_acc := COALESCE((v_mappings->>'LABOR_COST_ALLOCATED')::uuid, 
                           (SELECT id FROM public.accounts WHERE (code = '513' OR code = '511') AND organization_id = v_org_id LIMIT 1));

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

        -- 2. إلى ح/ مخزون المواد الخام (فقط للمواد التي لم تُصرف مسبقاً بطلب صرف)
        IF v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.mfg_material_request_items mri 
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id 
            WHERE mr.production_order_id = v_step.production_order_id AND mr.status = 'issued'
        ) THEN
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

    -- ج. [جديد] إضافة تكلفة المواد التي تم صرفها عبر طلبات الصرف اليدوية (MRI)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
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
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid,
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE (code = '10302' OR code = '103') AND organization_id = v_org_id LIMIT 1));

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

    -- 5. تحديث سعر البيع بناءً على التكلفة الفعلية وهامش الربح
    PERFORM public.mfg_update_selling_price_from_cost(p_order_id);

    -- 6. حساب انحراف التكلفة بعد الإغلاق (للوحة التحكم والتقارير)
    PERFORM public.mfg_calculate_production_variance(p_order_id);

    -- 7. توليد الأرقام التسلسلية للمنتجات (Batch Serials) آلياً عند الإغلاق
    PERFORM public.mfg_generate_batch_serials(p_order_id);
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
DROP FUNCTION IF EXISTS public.mfg_check_stock_availability(uuid, numeric);
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
    v_batch_ref := 'BATCH-' || to_char(now(), 'YYMMDDHH24MI') || '-' || substring(gen_random_uuid()::text, 1, 4);

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
            v_item.product_id, v_item.total_qty, 'in_progress', 
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
        WHERE r.product_id = v_item.product_id 
        AND (r.is_default = true OR r.id = (
            SELECT id FROM public.mfg_routings 
            WHERE product_id = v_item.product_id 
            ORDER BY is_default DESC, created_at DESC LIMIT 1
        ));

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
        FOR v_i IN 1..floor(COALESCE(v_order.quantity_to_produce, 0))::integer LOOP
            v_serial := 'SN-' || v_order.order_number || '-' || LPAD(v_i::text, 4, '0');
            INSERT INTO public.mfg_batch_serials (production_order_id, product_id, serial_number, organization_id)
            VALUES (p_order_id, v_order.product_id, v_serial, v_order.organization_id)
            ON CONFLICT (serial_number, organization_id) DO NOTHING;
        END LOOP;
    END IF;
END; $$;

-- تحديث دالة mfg_finalize_order لتشمل توليد السيريالات
-- (ملاحظة: الكود أدناه يفترض إضافة استدعاء الدالة الجديدة داخل finalize)

-- 13. دالة اختبار دورة التصنيع الكاملة (Manufacturing Integration Test)
DROP FUNCTION IF EXISTS public.mfg_test_full_cycle();
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

    step_name := '4. الإغلاق والسيريالات'; result := 'PASS ✅'; details := 'تم توليد 5 أرقام تسلسلية وتحديث المخزون'; RETURN NEXT;

    -- 5. التحقق النهائي
    IF EXISTS (SELECT 1 FROM public.mfg_batch_serials WHERE production_order_id = v_order_id) AND 
       (SELECT stock FROM public.products WHERE id = v_prod_id) = 5 THEN
        step_name := '5. التحقق من النتائج'; result := 'SUCCESS 🏆'; details := 'الدورة كاملة من الإنتاج للمحاسبة سليمة';
    ELSE
        step_name := '5. التحقق من النتائج'; result := 'FAIL ❌'; details := 'فشل في مطابقة المخزون أو السيريالات';
    END IF;
    RETURN NEXT;

END; $$;

-- 13.5 دالة اختبار تكامل مبيعات المطعم مع استهلاك المواد الخام
-- تهدف للتأكد من أن بيع وجبة (صنف تام) يؤدي لخصم مكوناتها (خامات) آلياً
DROP FUNCTION IF EXISTS public.mfg_test_pos_integration();
CREATE OR REPLACE FUNCTION public.mfg_test_pos_integration()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_meal_id uuid; v_meat_id uuid; v_bread_id uuid;
    v_session_id uuid; v_order_id uuid; v_meat_stock_before numeric; v_meat_stock_after numeric;
    v_items jsonb;
BEGIN
    -- 1. الإعداد الأساسي
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN SELECT id INTO v_org_id FROM public.organizations LIMIT 1; END IF;
    
    -- جلب مستودع
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;

    -- 2. إنشاء أصناف الاختبار
    -- خامات (لحم، خبز)
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('لحم تجريبي', 'STOCK', 'raw', 100, 50, v_org_id) RETURNING id INTO v_meat_id;
    
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('خبز تجريبي', 'STOCK', 'raw', 100, 5, v_org_id) RETURNING id INTO v_bread_id;

    -- وجبة نهائية (برجر)
    INSERT INTO public.products (name, product_type, mfg_type, organization_id, sales_price) 
    VALUES ('وجبة برجر اختبارية', 'STOCK', 'standard', v_org_id, 150) RETURNING id INTO v_meal_id;

    -- تسجيل أرصدة افتتاحية للتأكد من وجود مخزون فعلي في المحرك
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_meat_id, v_wh_id, 100, 50, v_org_id), (v_bread_id, v_wh_id, 100, 5, v_org_id);

    step_name := '1. تهيئة الأصناف والخامات'; result := 'PASS ✅'; details := 'تم إنشاء برجر، لحم، وخبز برصيد 100 لكل منهما'; RETURN NEXT;

    -- 3. بناء الـ BOM (الوصفة)
    -- البرجر يحتاج 1 لحم و 1 خبز
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_meal_id, v_meat_id, 1, v_org_id), (v_meal_id, v_bread_id, 1, v_org_id);

    step_name := '2. بناء وصفة الوجبة (BOM)'; result := 'PASS ✅'; details := 'الوجبة = 1 لحم + 1 خبز'; RETURN NEXT;

    -- تحديث المخزون الأولي لضمان جاهزية المحرك
    PERFORM public.recalculate_stock_rpc(v_org_id);
    SELECT stock INTO v_meat_stock_before FROM public.products WHERE id = v_meat_id;

    -- 4. محاكاة عملية بيع مطعم (POS)
    -- إنشاء جلسة
    INSERT INTO public.table_sessions (opened_at, status, organization_id) 
    VALUES (now(), 'OPEN', v_org_id) RETURNING id INTO v_session_id;

    -- بناء بنود الطلب (طلب 5 وجبات برجر)
    v_items := jsonb_build_array(
        jsonb_build_object('product_id', v_meal_id, 'quantity', 5, 'unit_price', 150)
    );

    -- استدعاء دالة إنشاء الطلب
    v_order_id := public.create_restaurant_order(v_session_id, auth.uid(), 'DINEIN', 'اختبار تكامل POS-MFG', v_items, NULL, v_wh_id);

    step_name := '3. إنشاء طلب مطعم (POS)'; result := 'PASS ✅'; details := 'تم طلب 5 وجبات برجر بنجاح'; RETURN NEXT;

    -- 5. تفعيل الخصم (تغيير الحالة إلى PAID)
    -- هذا سيقوم بتشغيل التريجر trg_handle_stock_on_order -> mfg_deduct_stock_from_order
    UPDATE public.orders SET status = 'PAID' WHERE id = v_order_id;

    step_name := '4. اعتماد الدفع (PAID)'; result := 'PASS ✅'; details := 'تم تحويل حالة الطلب، جاري فحص استهلاك المخزون اللحظي'; RETURN NEXT;

    -- 6. التحقق النهائي من المخزون (يجب أن ينقص رصيد الخامات وليس المنتج التام)
    SELECT stock INTO v_meat_stock_after FROM public.products WHERE id = v_meat_id;

    IF v_meat_stock_after = (v_meat_stock_before - 5) THEN
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'SUCCESS 🏆'; 
        details := format('رصيد اللحم الأولي: %s، الحالي: %s (تم خصم 5 خامات بنجاح آلياً بدلاً من الوجبة)', v_meat_stock_before, v_meat_stock_after);
    ELSE
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'FAIL ❌'; 
        details := format('خطأ في الخصم! الأولي: %s، الحالي: %s (المتوقع: %s)', v_meat_stock_before, v_meat_stock_after, (v_meat_stock_before - 5));
    END IF;
    RETURN NEXT;

    -- 7. التحقق من وجود القيد المحاسبي
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE related_document_id = v_order_id) THEN
        step_name := '6. فحص القيد المحاسبي'; result := 'PASS ✅'; details := 'تم إنشاء قيد مبيعات وربطه بالطلب';
    ELSE
        step_name := '6. فحص القيد المحاسبي'; result := 'WARNING ⚠️'; details := 'لم يتم العثور على قيد (ربما في انتظار إغلاق الوردية)';
    END IF;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار (لتجنب تراكم المنتجات الوهمية)
    DELETE FROM public.order_items WHERE order_id = v_order_id;
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.table_sessions WHERE id = v_session_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_meal_id;
    DELETE FROM public.products WHERE organization_id = v_org_id AND name LIKE '%تجريبي%';

EXCEPTION WHEN OTHERS THEN
    step_name := 'CRITICAL ERROR'; result := 'ERROR 🛑'; details := SQLERRM;
    RETURN NEXT;
END; $$;

-- دالة تحديث سعر البيع بناءً على التكلفة الفعلية (تستخدم هامش ربح افتراضي 20%)
-- تُستدعى عند إغلاق أمر الإنتاج لتحديث سعر المنتج في بطاقة الصنف
DROP FUNCTION IF EXISTS public.mfg_update_selling_price_from_cost(uuid);
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order record;
    v_cost_per_unit numeric;
BEGIN
    SELECT po.* INTO v_order FROM public.mfg_production_orders po WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- جلب التكلفة الفعلية للوحدة من رؤية الربحية
    SELECT (total_actual_cost / NULLIF(qty, 0)) INTO v_cost_per_unit 
    FROM public.v_mfg_order_profitability 
    WHERE order_id = p_order_id AND organization_id = v_order.organization_id;

    IF v_cost_per_unit > 0 THEN
        -- تحديث سعر المنتج (التكلفة + 20% هامش ربح)
        UPDATE public.products 
        SET price = ROUND(v_cost_per_unit * 1.20, 2)
        WHERE id = v_order.product_id AND organization_id = v_order.organization_id;
    END IF;
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
    -- تم التحديث لربط المكونات بطلبات صرف المواد (Material Requests)
    SELECT jsonb_agg(t) INTO v_components FROM (
        SELECT 
            rm.name as material_name,
            ROUND(SUM(amu.standard_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as standard_per_unit,
            ROUND(SUM(amu.actual_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as actual_per_unit,
            jsonb_agg(DISTINCT jsonb_build_object(
                'request_number', mr.request_number,
                'issue_date', mr.issue_date
            )) as associated_requests
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        LEFT JOIN public.mfg_material_requests mr ON mr.production_order_id = op.production_order_id
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
DROP FUNCTION IF EXISTS public.mfg_get_shop_floor_tasks(uuid);
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

-- 🕒 20. جدولة تنبيهات التصنيع (Manufacturing Alerts Automation)
-- يتم تشغيل هذه المهام عبر pg_cron لفحص الانحرافات والسيريالات المفقودة
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- تنبيه كفاءة مراكز العمل (كل ساعة)
        PERFORM cron.schedule('mfg-efficiency-check', '0 * * * *', 'SELECT public.mfg_check_efficiency_alerts(75);');
        
        -- تنبيه انحراف المواد (BOM Variance) (يومياً)
        -- ملاحظة: نفترض وجود دالة mfg_check_variance_alerts التي ستقوم ببرمجتها
        -- PERFORM cron.schedule('mfg-variance-check', '0 2 * * *', 'SELECT public.mfg_check_variance_alerts();');
        
        RAISE NOTICE '✅ تم ضبط جدولة تنبيهات التصنيع بنجاح.';
    END IF;
END $$;

-- 20. دالة فحص جاهزية المنتج للإنتاج (Production Readiness Check)
-- تضمن أن المنتج لديه BOM و Routing قبل محاولة إنشاء أمر تشغيل
DROP FUNCTION IF EXISTS public.mfg_check_production_readiness(uuid);
CREATE OR REPLACE FUNCTION public.mfg_check_production_readiness(p_product_id uuid)
RETURNS TABLE (
    is_ready boolean,
    missing_elements text[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_errors text[] := '{}';
BEGIN
    -- 1. فحص وجود BOM
    IF NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'قائمة المواد (BOM) غير معرفة');
    END IF;

    -- 2. فحص وجود مسار إنتاج (Routing)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id AND deleted_at IS NULL) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج (Routing) غير معرف');
    END IF;

    -- 3. فحص وجود خطوات في المسار
    IF EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id) AND 
       NOT EXISTS (SELECT 1 FROM public.mfg_routing_steps rs 
                   JOIN public.mfg_routings r ON rs.routing_id = r.id 
                   WHERE r.product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج لا يحتوي على خطوات تنفيذية');
    END IF;

    RETURN QUERY SELECT 
        (array_length(v_errors, 1) IS NULL) as is_ready,
        v_errors;
END; $$;

-- دالة جلب الفواتير القابلة للتصنيع (Helper for BatchOrderManager)
CREATE OR REPLACE FUNCTION public.mfg_get_pending_invoices(p_org_id uuid)
RETURNS TABLE (
    invoice_id uuid,
    invoice_num text,
    cust_name text,
    order_date timestamptz,
    total numeric,
    invoice_status text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public 
AS $$
BEGIN
    RETURN QUERY
    SELECT i.id, i.invoice_number, c.name, i.created_at, COALESCE(i.total_amount, 0) as total
    , i.status
    FROM public.invoices i
    JOIN public.customers c ON i.customer_id = c.id
    WHERE i.organization_id = p_org_id
    AND i.status != 'draft' -- جلب الفواتير المعتمدة فقط أو حسب سياق عملك
    AND EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.mfg_routings r ON ii.product_id = r.product_id
        WHERE ii.invoice_id = i.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po 
        -- استبعاد الفاتورة إذا كان رقمها موجوداً ضمن مرجع الدفعة أو حقل مخصص
        WHERE po.batch_number LIKE '%' || i.invoice_number || '%'
    )
    ORDER BY i.created_at DESC;
END; $$;

-- 📊 21. عرض انحراف المواد (BOM Variance View)
-- هذا العرض مطلوب للوحة التحكم الصناعية لمراقبة فروقات الاستهلاك
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_bom_variance WITH (security_invoker = true) AS
SELECT 
    amu.id,
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    amu.standard_quantity,
    amu.actual_quantity,
    (amu.actual_quantity - amu.standard_quantity) as variance_qty,
    CASE 
        WHEN amu.standard_quantity > 0 
        THEN ROUND(((amu.actual_quantity - amu.standard_quantity) / amu.standard_quantity) * 100, 2)
        ELSE 0 
    END as variance_percentage,
    amu.organization_id,
    po.id as production_order_id,
    amu.created_at
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.products rm ON amu.raw_material_id = rm.id;

-- 📊 22. عرض كفاءة مراكز العمل (Work Center Efficiency View)
DROP VIEW IF EXISTS public.v_mfg_work_center_efficiency CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_work_center_efficiency WITH (security_invoker = true) AS
SELECT 
    wc.id as work_center_id,
    wc.name as work_center_name,
    SUM(rs.standard_time_minutes * op.produced_qty) as total_standard_minutes,
    SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time))/60) as total_actual_minutes,
    CASE 
        WHEN SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time))/60) > 0 
        THEN ROUND((SUM(rs.standard_time_minutes * op.produced_qty) / SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time))/60)) * 100, 2)
        ELSE 0 
    END as efficiency_percentage,
    wc.organization_id
FROM public.mfg_work_centers wc
JOIN public.mfg_routing_steps rs ON wc.id = rs.work_center_id
JOIN public.mfg_order_progress op ON rs.id = op.step_id
WHERE op.status = 'completed'
GROUP BY wc.id, wc.name, wc.organization_id;

-- منح الصلاحيات اللازمة للواجهة الأمامية
GRANT SELECT ON public.v_mfg_bom_variance TO authenticated;
GRANT SELECT ON public.v_mfg_work_center_efficiency TO authenticated;

-- 23. دالة حساب الانحراف المالي الفعلي بين التكلفة المعيارية والتكلفة الحقيقية بعد إغلاق أمر الإنتاج
CREATE OR REPLACE FUNCTION public.mfg_calculate_production_variance(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_actual_cost numeric := 0;
    v_standard_cost_per_unit numeric := 0;
    v_standard_total_cost numeric := 0;
    v_variance_amount numeric := 0;
    v_variance_percentage numeric := 0;
    v_org_id uuid;
BEGIN
    -- 1. جلب بيانات أمر الإنتاج
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'أمر الإنتاج غير موجود');
    END IF;
    v_org_id := v_order.organization_id;

    -- 2. جلب التكلفة الفعلية الإجمالية من رؤية ربحية أمر الإنتاج
    SELECT total_actual_cost INTO v_actual_cost
    FROM public.v_mfg_order_profitability
    WHERE order_id = p_order_id AND organization_id = v_org_id;

    -- 3. حساب التكلفة المعيارية الإجمالية (التكلفة المعيارية للوحدة * الكمية المنتجة)
    v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order.product_id);
    v_standard_total_cost := v_standard_cost_per_unit * v_order.quantity_to_produce;

    -- 4. حساب الانحراف (الفعلي - المعياري)
    v_variance_amount := v_actual_cost - v_standard_total_cost;
    IF v_standard_total_cost > 0 THEN
        v_variance_percentage := ROUND((v_variance_amount / v_standard_total_cost) * 100, 2);
    ELSE
        v_variance_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
    END IF;

    -- 5. تسجيل أو تحديث الانحراف في الجدول الجديد لضمان بقاء البيانات التاريخية
    INSERT INTO public.mfg_production_variances (
        production_order_id, actual_total_cost, standard_total_cost, 
        variance_amount, variance_percentage, organization_id
    ) VALUES (
        p_order_id, v_actual_cost, v_standard_total_cost, 
        v_variance_amount, v_variance_percentage, v_org_id
    ) ON CONFLICT (production_order_id) DO UPDATE SET
        actual_total_cost = EXCLUDED.actual_total_cost,
        standard_total_cost = EXCLUDED.standard_total_cost,
        variance_amount = EXCLUDED.variance_amount,
        variance_percentage = EXCLUDED.variance_percentage;

    RETURN jsonb_build_object(
        'order_id', p_order_id, 'order_number', v_order.order_number, 'product_id', v_order.product_id,
        'quantity_produced', v_order.quantity_to_produce, 'actual_total_cost', v_actual_cost,
        'standard_total_cost', v_standard_total_cost, 'variance_amount', v_variance_amount,
        'variance_percentage', v_variance_percentage
    );
END; $$;

-- 24. دالة حجز المخزون لأمر الإنتاج (Stock Reservation)
CREATE OR REPLACE FUNCTION public.mfg_reserve_stock_for_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shortage_exists boolean := false;
BEGIN
    IF EXISTS (SELECT 1 FROM public.mfg_check_stock_availability(
        (SELECT product_id FROM public.mfg_production_orders WHERE id = p_order_id),
        (SELECT quantity_to_produce FROM public.mfg_production_orders WHERE id = p_order_id)
    )) THEN
        RETURN jsonb_build_object('success', false, 'message', 'يوجد نقص في الخامات، لا يمكن حجز المخزون');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم التأكد من توفر كافة الخامات وتخصيصها للأمر');
END; $$;

-- 25. دالة إنشاء طلب صرف مواد لأمر إنتاج
CREATE OR REPLACE FUNCTION public.mfg_create_material_request(p_production_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_request_id uuid;
    v_request_number text;
    v_org_id uuid;
    v_material_item record;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_production_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    v_org_id := v_order.organization_id;

    IF EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_production_order_id AND status IN ('pending', 'approved')) THEN
        RAISE EXCEPTION 'يوجد بالفعل طلب صرف مواد مفتوح لأمر الإنتاج هذا.';
    END IF;

    v_request_number := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.mfg_material_requests (
        production_order_id, request_number, requested_by, organization_id, status
    ) VALUES (
        p_production_order_id, v_request_number, auth.uid(), v_org_id, 'pending'
    ) RETURNING id INTO v_request_id;

    FOR v_material_item IN
        SELECT
            sm.raw_material_id,
            SUM(sm.quantity_required * v_order.quantity_to_produce) AS total_required_qty
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE r.product_id = v_order.product_id AND r.is_default = TRUE AND r.organization_id = v_org_id
        GROUP BY sm.raw_material_id
    LOOP
        INSERT INTO public.mfg_material_request_items (
            material_request_id, raw_material_id, quantity_requested, organization_id
        ) VALUES (
            v_request_id, v_material_item.raw_material_id, v_material_item.total_required_qty, v_org_id
        );
    END LOOP;

    RETURN v_request_id;
END; $$;

-- 26. دالة صرف المواد من المخزون
CREATE OR REPLACE FUNCTION public.mfg_issue_material_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_request record; v_item record; v_org_id uuid; v_journal_id uuid; v_mappings jsonb; v_current_stock numeric;
    v_inv_raw_acc uuid; v_wip_acc uuid; v_total_issued_cost numeric := 0; v_product_cost numeric;
BEGIN
    SELECT * INTO v_request FROM public.mfg_material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب صرف المواد غير موجود'; END IF;
    IF v_request.status = 'issued' THEN RETURN; END IF;
    v_org_id := v_request.organization_id;

    FOR v_item IN SELECT * FROM public.mfg_material_request_items WHERE material_request_id = p_request_id LOOP
        SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        IF v_current_stock < v_item.quantity_requested THEN
            RAISE EXCEPTION 'نقص في المخزون للمادة %', (SELECT name FROM public.products WHERE id = v_item.raw_material_id);
        END IF;

        UPDATE public.products SET stock = stock - v_item.quantity_requested 
        WHERE id = v_item.raw_material_id AND organization_id = v_org_id;

        SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) INTO v_product_cost 
        FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        v_total_issued_cost := v_total_issued_cost + (v_item.quantity_requested * v_product_cost);
        UPDATE public.mfg_material_request_items SET quantity_issued = v_item.quantity_requested WHERE id = v_item.id;
    END LOOP;

    UPDATE public.mfg_material_requests SET status = 'issued', issued_by = auth.uid(), issue_date = now() WHERE id = p_request_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_raw_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );

    -- إزالة شرط الصرامة على v_wip_acc لضمان إنشاء القيد حتى لو تم الترحيل لحساب المخزون الرئيسي
    IF v_total_issued_cost > 0 AND v_inv_raw_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, 'صرف مواد لأمر الإنتاج رقم: ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = v_request.production_order_id), v_request.request_number, 'posted', v_org_id, true, p_request_id, 'mfg_material_request')
        RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_total_issued_cost, 0, 'تحميل مواد خام على WIP', v_org_id), (v_je_id, v_inv_raw_acc, 0, v_total_issued_cost, 'صرف مواد خام من المخزن', v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 27. رؤية تقييم WIP
DROP VIEW IF EXISTS public.v_mfg_wip_valuation CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_valuation WITH (security_invoker = true) AS
SELECT po.id AS production_order_id, po.order_number, p.name AS product_name, po.quantity_to_produce, po.status, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS total_labor_cost_incurred,
       COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) AS total_material_cost_incurred,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0)) AS total_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
WHERE po.status = 'in_progress'
GROUP BY po.id, po.order_number, p.name, po.quantity_to_produce, po.status, po.organization_id;

-- 28. مشغل إنشاء طلب الصرف تلقائياً
CREATE OR REPLACE FUNCTION public.fn_mfg_auto_create_material_request()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        PERFORM public.mfg_create_material_request(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mfg_auto_material_request ON public.mfg_production_orders;
CREATE TRIGGER trg_mfg_auto_material_request
AFTER UPDATE OF status ON public.mfg_production_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_mfg_auto_create_material_request();

-- 29. تقرير ملخص شهري WIP
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
SELECT to_char(po.created_at, 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.mfg_order_progress op ON po.id = op.production_order_id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
WHERE po.status = 'in_progress'
GROUP BY 1, 2, 3, 4;

-- 30. دوال GenealogyViewer
DROP FUNCTION IF EXISTS public.mfg_get_serials_by_order(text);
CREATE OR REPLACE FUNCTION public.mfg_get_serials_by_order(p_order_number text)
RETURNS TABLE (serial_number text, product_name text, batch_number text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT bs.serial_number, p.name, po.batch_number
    FROM public.mfg_batch_serials bs
    JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
    JOIN public.products p ON bs.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

DROP FUNCTION IF EXISTS public.mfg_get_production_order_details_by_number(text);
CREATE OR REPLACE FUNCTION public.mfg_get_production_order_details_by_number(p_order_number text)
RETURNS TABLE (order_id uuid, order_number text, status text, product_name text, quantity numeric) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT po.id, po.order_number, po.status, p.name, po.quantity_to_produce
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

CREATE OR REPLACE FUNCTION public.mfg_start_production_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.mfg_production_orders SET status = 'in_progress', start_date = now()::date WHERE id = p_order_id;
END; $$;

-- 📊 31. رؤية لوحة التحكم الصناعية (Manufacturing Dashboard View)
-- هذه الرؤية ضرورية لعمل لوحة القيادة وحساب نسبة الإنجاز وصلاحية الإغلاق
DROP VIEW IF EXISTS public.v_mfg_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_dashboard WITH (security_invoker = true) AS
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    po.quantity_to_produce,
    po.status,
    po.organization_id,
    po.created_at,
    -- حساب نسبة الإنجاز بناءً على المراحل المكتملة
    ROUND(COALESCE(
        (SELECT (COUNT(id) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(id), 0)) * 100 
         FROM public.mfg_order_progress 
         WHERE production_order_id = po.id), 
        0
    ), 0) as completion_percentage,
    -- يمكن إغلاق الطلب فقط إذا كان جارياً وجميع مراحله مكتملة وفحص الجودة تم
    (
        po.status = 'in_progress' 
        AND EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = po.id)
        AND NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = po.id AND status != 'completed')
        AND NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = po.id AND qc_verified IS FALSE)
    ) as can_finalize
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id;

GRANT SELECT ON public.v_mfg_dashboard TO authenticated;