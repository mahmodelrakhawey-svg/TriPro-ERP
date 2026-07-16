-- 🛠️ Migration: Fix Cost Closing Journal Entry Conditional Check
-- Date: 2026-07-16
-- Description: Fixes a bug where closing journal entries were not created for production orders if the standard recipe cost (BOM) was calculated as 0, even when actual WIP costs were accumulated.

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

    -- 🛡️ حساب رصيد WIP الحقيقي للأمر من كافة القيود (Step + MR)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE (
        (je.related_document_id = p_order_id AND je.related_document_type IN ('mfg_order', 'mfg_byproduct'))
        OR (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
        OR (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE production_order_id = p_order_id))
    ) AND jl.account_id = v_wip_acc;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order';

    -- [صمام أمان] منع إغلاق أوامر لم يبدأ العمل فيها فعلياً
    IF NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_order_id AND status = 'issued') THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أمر إنتاج لم يتم البدء فيه أو صرف مواد له. يرجى إكمال مراحل العمل أو صرف المواد أولاً.';
    END IF;

    -- 🛡️ صمام أمان: ضمان وجود مستودع للأمر قبل الإغلاق
    IF v_order.warehouse_id IS NULL THEN
        v_order.warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1);
        UPDATE public.mfg_production_orders SET warehouse_id = v_order.warehouse_id WHERE id = p_order_id;
    END IF;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- حساب التكلفة التقديرية بناءً على قائمة المواد (BOM)
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

    -- 🚀 إصلاح: التحقق مما إذا كانت التكلفة الفعلية أو التقديرية أكبر من صفر لضمان ترحيل القيد
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
