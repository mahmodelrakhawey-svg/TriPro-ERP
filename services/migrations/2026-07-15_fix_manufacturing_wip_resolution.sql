-- 🛠️ Migration: Fix Manufacturing WIP Account Resolution & Double-Deduction Conflict
-- Date: 2026-07-15

-- 1️⃣ دالة مساعدة لحل حساب الإنتاج تحت التشغيل (WIP) للتصنيع وتفادي القيد على حسابات المشاريع
CREATE OR REPLACE FUNCTION public.resolve_mfg_wip_account(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_mappings jsonb;
    v_wip_acc uuid;
    v_wip_code text;
    v_mfg_wip_acc uuid;
BEGIN
    -- أ. البحث أولاً في خريطة الربط المحاسبي المحددة من الإعدادات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;
    v_wip_acc := (v_mappings->>'INVENTORY_WIP')::uuid;
    
    -- ب. في حال عدم الربط، يتم البحث عن الحساب الافتراضي كود 10303
    IF v_wip_acc IS NULL THEN
        SELECT id, code INTO v_wip_acc, v_wip_code FROM public.accounts 
        WHERE code = '10303' AND organization_id = p_org_id LIMIT 1;
    END IF;
    
    -- ج. كخط دفاع أخير، نرجع لحساب المخزون الرئيسي كود 103
    IF v_wip_acc IS NULL THEN
        SELECT id, code INTO v_wip_acc, v_wip_code FROM public.accounts 
        WHERE code = '103' AND organization_id = p_org_id LIMIT 1;
    END IF;

    IF v_wip_acc IS NULL THEN
        RETURN NULL;
    END IF;

    -- د. إذا كان الحساب المختار ليس مجموعة (Leaf Account)، نستخدمه مباشرة
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_wip_acc AND is_group = true) THEN
        RETURN v_wip_acc;
    END IF;

    -- هـ. إذا كان الحساب مجموعة، نبحث عن حساب فرعي داخله لا يمثل مشروعاً (حتى لا تذهب قيود التصنيع لحسابات المشاريع)
    SELECT id INTO v_mfg_wip_acc FROM public.accounts
    WHERE parent_id = v_wip_acc 
      AND is_group = false 
      AND name NOT LIKE 'مشروع:%' 
      AND name NOT LIKE 'Project:%'
    ORDER BY code LIMIT 1;

    -- و. إذا لم نجد حساباً فرعياً مناسباً للتصنيع، نقوم بإنشاء حساب مخصص للتصنيع فوراً تحت الحساب الرئيسي
    IF v_mfg_wip_acc IS NULL THEN
        SELECT code INTO v_wip_code FROM public.accounts WHERE id = v_wip_acc;
        
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (p_org_id, 'مخزون إنتاج تحت التشغيل - تصنيع', v_wip_code || '-mfg', v_wip_acc, 'asset', true, false)
        RETURNING id INTO v_mfg_wip_acc;
    END IF;

    RETURN v_mfg_wip_acc;
END; $$;


-- 2️⃣ تحديث دالة صرف المواد لمنع الازدواجية والخصم المزدوج
CREATE OR REPLACE FUNCTION public.mfg_issue_material_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_request record; v_item record; v_org_id uuid; v_je_id uuid; v_mappings jsonb; v_current_stock numeric;
    v_inv_raw_acc uuid; v_wip_acc uuid; v_total_issued_cost numeric := 0; v_product_cost numeric;
    v_item_has_actual_usage boolean;
BEGIN
    SELECT * INTO v_request FROM public.mfg_material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب صرف المواد غير موجود'; END IF;
    IF v_request.status = 'issued' THEN RETURN; END IF;
    v_org_id := v_request.organization_id;

    FOR v_item IN SELECT * FROM public.mfg_material_request_items WHERE material_request_id = p_request_id LOOP
        -- 🛡️ التحقق مما إذا تم استهلاك هذا الصنف بالفعل في خطوات الإنتاج لتجنب التكرار
        SELECT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op
            JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
            WHERE op.production_order_id = v_request.production_order_id
              AND amu.raw_material_id = v_item.raw_material_id
        ) INTO v_item_has_actual_usage;

        IF v_item_has_actual_usage THEN
            -- إذا تم استهلكه في أرضية المصنع، نكتفي بتسجيل صرفه ورقياً لمنع ازدواجية الخصم والقيود وتجنب خطأ نقص المخزون
            UPDATE public.mfg_material_request_items 
            SET quantity_issued = v_item.quantity_requested 
            WHERE id = v_item.id;
        ELSE
            -- 🚀 فحص التوفر بالكمية الأساسية والخصم الفعلي للمواد التي لم تستهلك بعد
            DECLARE
                v_base_qty numeric := public.uom_convert(v_item.quantity_requested, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.raw_material_id));
            BEGIN
                SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
                
                IF v_current_stock < v_base_qty THEN
                    RAISE EXCEPTION 'نقص في المخزون للمادة %', (SELECT name FROM public.products WHERE id = v_item.raw_material_id);
                END IF;

                UPDATE public.products SET stock = stock - v_base_qty
                WHERE id = v_item.raw_material_id AND organization_id = v_org_id;

                SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) INTO v_product_cost
                FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
                
                v_total_issued_cost := v_total_issued_cost + (v_base_qty * v_product_cost);
                UPDATE public.mfg_material_request_items SET quantity_issued = v_item.quantity_requested WHERE id = v_item.id;
            END;
        END IF;
    END LOOP;

    UPDATE public.mfg_material_requests SET status = 'issued', issued_by = auth.uid(), issue_date = now() WHERE id = p_request_id;

    -- حل حسابات القيد
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_raw_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)));
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    -- إنشاء القيد فقط للمواد التي تم صرفها حديثاً ولم تقيد بعد في الخطوات الإنتاجية
    IF v_total_issued_cost > 0 AND v_inv_raw_acc IS NOT NULL AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, 'صرف مواد لأمر الإنتاج رقم: ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = v_request.production_order_id), v_request.request_number, 'posted', v_org_id, true, p_request_id, 'mfg_material_request')
        RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_total_issued_cost, 0, 'تحميل مواد خام على WIP', v_org_id), (v_je_id, v_inv_raw_acc, 0, v_total_issued_cost, 'صرف مواد خام من المخزن', v_org_id);
    END IF;
    
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;


-- 3️⃣ تحديث دوال إكمال المراحل والإنهاء النهائي والهالك لاستخدام حل حساب الـ WIP الذكي
-- أ. دالة إكمال المرحلة
CREATE OR REPLACE FUNCTION public.mfg_complete_step(p_progress_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_step record; v_routing_step record; v_mat record;
    v_usage_qty numeric; v_mat_total_cost numeric := 0; v_labor_cost numeric := 0;
    v_je_id uuid; v_mappings jsonb; v_wip_acc uuid; v_inv_acc uuid; v_labor_acc uuid;
    v_org_id uuid; v_scrap_qty numeric := 0; v_wip_debit_amount numeric := 0; v_has_mr boolean;
BEGIN
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF;
    v_org_id := v_step.organization_id;

    SELECT EXISTS (
        SELECT 1 FROM public.mfg_material_requests 
        WHERE production_order_id = v_step.production_order_id
        AND status = 'issued'
        AND id IN (SELECT material_request_id FROM public.mfg_material_request_items WHERE raw_material_id IN (SELECT raw_material_id FROM public.mfg_step_materials WHERE step_id = v_step.step_id))
    ) INTO v_has_mr;

    SELECT COALESCE(SUM(quantity), 0) INTO v_scrap_qty
    FROM public.mfg_scrap_logs
    WHERE order_progress_id = p_progress_id;

    SELECT rs.standard_time_minutes, wc.hourly_rate
    INTO v_routing_step
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE rs.id = v_step.step_id;

    v_labor_cost := (COALESCE(v_routing_step.standard_time_minutes, 0) / 60.0) * p_qty * COALESCE(v_routing_step.hourly_rate, 0);

    UPDATE public.mfg_order_progress SET
        status = 'completed',
        actual_end_time = now(),
        produced_qty = p_qty,
        labor_cost_actual = v_labor_cost,
        qc_verified = NULL
    WHERE id = p_progress_id AND status = 'active';

    FOR v_mat IN
        SELECT raw_material_id, quantity_required, uom_id
        FROM public.mfg_step_materials
        WHERE step_id = v_step.step_id
    LOOP
        v_usage_qty := v_mat.quantity_required * p_qty;

        v_mat_total_cost := v_mat_total_cost + (
            public.uom_convert(v_usage_qty, v_mat.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_mat.raw_material_id)) * 
            COALESCE((SELECT NULLIF(weighted_average_cost, 0) FROM public.products WHERE id = v_mat.raw_material_id), (SELECT NULLIF(cost, 0) FROM public.products WHERE id = v_mat.raw_material_id), (SELECT purchase_price FROM public.products WHERE id = v_mat.raw_material_id), 0)
        );

        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, uom_id, organization_id)
        VALUES (
            p_progress_id,
            v_mat.raw_material_id,
            v_usage_qty,
            v_usage_qty + COALESCE((SELECT SUM(quantity) FROM public.mfg_scrap_logs WHERE order_progress_id = p_progress_id AND product_id = v_mat.raw_material_id), 0),
            v_mat.uom_id,
            v_org_id
        );
    END LOOP;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);
    v_inv_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)));
    v_labor_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'LABOR_COST_ALLOCATED')::uuid,
        (SELECT id FROM public.accounts WHERE code = '513' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)
    ));

    v_wip_debit_amount := COALESCE(v_labor_cost, 0);
    IF NOT v_has_mr THEN
        v_wip_debit_amount := v_wip_debit_amount + v_mat_total_cost;
    END IF;

    IF v_wip_acc IS NOT NULL AND v_wip_debit_amount > 0 THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
        ) VALUES (
            now()::date,
            'تحميل تكاليف المرحلة: ' || (SELECT operation_name FROM public.mfg_routing_steps WHERE id = v_step.step_id),
            'MFG-STEP-' || substring(p_progress_id::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_step'
        ) RETURNING id INTO v_je_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_wip_debit_amount, 0, 'تكلفة قيمة مضافة للمرحلة', v_org_id);

        IF NOT v_has_mr AND v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_inv_acc, 0, v_mat_total_cost, 'صرف مواد خام للمرحلة الإنتاجية', v_org_id);
        END IF;

        IF v_labor_cost > 0 AND v_labor_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_labor_acc, 0, v_labor_cost, 'تحميل تكلفة عمالة المرحلة الإنتاجية', v_org_id);
        END IF;
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ب. دالة إغلاق أمر الإنتاج
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed',
    p_qc_notes text DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_accumulated_wip numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb; v_total_cost numeric := 0; v_wip_variance_acc uuid;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;

    v_org_id := v_order.organization_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    SELECT COALESCE(SUM(po.labor_cost_actual), 0) INTO v_accumulated_wip
    FROM public.mfg_order_progress po
    WHERE po.production_order_id = p_order_id;

    -- إضافة قيمة المواد المستهلكة (سواء من الاستهلاك الفعلي أو طلبات الصرف)
    v_accumulated_wip := v_accumulated_wip + COALESCE((
        SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost,0), NULLIF(p.cost,0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products p ON amu.raw_material_id = p.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- إضافة قيمة طلبات الصرف التي لم يجر تسجيل استهلاك فعلي لها
    v_accumulated_wip := v_accumulated_wip + COALESCE((
        SELECT SUM(public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost,0), NULLIF(p.cost,0), p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op_sub
            JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
            WHERE op_sub.production_order_id = p_order_id AND amu_sub.raw_material_id = mri.raw_material_id
        )
    ), 0);

    SELECT SUM(quantity_required * (
        SELECT COALESCE(NULLIF(weighted_average_cost,0), NULLIF(cost,0), purchase_price, 0) FROM public.products WHERE id = raw_material_id
    )) INTO v_total_cost FROM public.bill_of_materials WHERE product_id = v_order.product_id;

    v_total_cost := COALESCE(v_total_cost, 0) * v_order.quantity_to_produce;

    IF p_final_status = 'completed' THEN
        DECLARE
            v_new_wac numeric;
            v_current_stock numeric;
        BEGIN
            SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_order.product_id AND organization_id = v_org_id;
            
            SELECT 
                CASE 
                    WHEN (v_current_stock + v_order.quantity_to_produce) > 0 
                    THEN ROUND(((v_current_stock * COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0)) + COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost)) / (v_current_stock + v_order.quantity_to_produce), 4)
                    ELSE COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost) / v_order.quantity_to_produce
                END INTO v_new_wac
            FROM public.products WHERE id = v_order.product_id AND organization_id = v_org_id;

            IF v_new_wac > 0 THEN
                UPDATE public.products 
                SET weighted_average_cost = v_new_wac,
                    cost = v_new_wac,
                    purchase_price = CASE WHEN mfg_type = 'standard' THEN v_new_wac ELSE purchase_price END
                WHERE id = v_order.product_id AND organization_id = v_org_id;
            END IF;
        END;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
        
        UPDATE public.sales_orders SET status = 'ready' WHERE order_number = v_order.batch_number AND organization_id = v_org_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1)));
    v_loss_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)));
    v_wip_variance_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WIP_VARIANCE_ACCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)));

    IF (COALESCE(v_accumulated_wip, 0) > 0 OR COALESCE(v_total_cost, 0) > 0) AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost), 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_wip_acc, 0, COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost), COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    BEGIN
        PERFORM public.mfg_calculate_production_variance(p_order_id);
        PERFORM public.mfg_generate_batch_serials(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id, user_id)
        VALUES (SQLERRM, jsonb_build_object('order_id', p_order_id, 'step', 'mfg_finalize_sub_functions'), 'mfg_finalize_order', v_org_id, auth.uid());
        RAISE WARNING 'تنبيه: فشل تشغيل بعض العمليات المساعدة لأمر الإنتاج %: %', p_order_id, SQLERRM;
    END;
    
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
END; $$;

-- ج. دالة تسجيل الهالك
CREATE OR REPLACE FUNCTION public.mfg_record_scrap(p_progress_id uuid, p_material_id uuid, p_qty numeric, p_reason text) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_material_name text; v_cost numeric := 0; v_scrap_acc uuid; v_wip_acc uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT name INTO v_material_name FROM public.products WHERE id = p_material_id;

    SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) INTO v_cost 
    FROM public.products WHERE id = p_material_id AND organization_id = v_org_id;

    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, reason, organization_id)
    VALUES (p_progress_id, p_material_id, p_qty, p_reason, v_org_id);

    UPDATE public.products SET stock = stock - p_qty WHERE id = p_material_id AND organization_id = v_org_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_scrap_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    ));
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    IF v_scrap_acc IS NOT NULL AND v_cost > 0 AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
        ) VALUES (
            now()::date,
            'إثبات تالف صناعي: ' || v_material_name || ' - ' || p_reason,
            'MFG-SCRAP-' || substring(gen_random_uuid()::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_scrap'
        ) RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_scrap_acc, (p_qty * v_cost), 0, 'تكلفة هالك تصنيع مسموح به', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, 0, (p_qty * v_cost), 'تحويل من WIP لحساب الهالك', v_org_id);
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;


-- 4️⃣ تحديث دالة تسجيل المنتجات العرضية (By-products) لاستخدام الحساب الذكي
CREATE OR REPLACE FUNCTION public.mfg_record_byproduct(p_progress_id uuid, p_product_id uuid, p_qty numeric, p_market_value numeric) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_order_id uuid; v_je_id uuid; v_mappings jsonb; v_wip_acc uuid;
BEGIN
    SELECT organization_id, production_order_id INTO v_org_id, v_order_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    
    INSERT INTO public.mfg_byproducts_logs (order_progress_id, product_id, quantity, market_value_per_unit, organization_id)
    VALUES (p_progress_id, p_product_id, p_qty, p_market_value, v_org_id);

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
    VALUES (now()::date, 'إثبات منتج عرضي - تخفيض تكلفة WIP', 'BY-PROD', 'posted', v_org_id, v_order_id, 'mfg_byproduct')
    RETURNING id INTO v_je_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1))), 
            (p_qty * p_market_value), 0, 'مخزون منتج عرضي', v_org_id);

    IF v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, 0, (p_qty * p_market_value), 'تخفيض تكلفة WIP بمنتج عرضي', v_org_id);
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;
