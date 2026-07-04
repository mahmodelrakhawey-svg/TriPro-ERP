-- =================================================================
-- TriPro ERP - Manufacturing Barcode Command Prefixes
-- التاريخ: 04 يوليو 2026
-- الوصف: تحديث دالة معالجة باركود أرضية المصنع لدعم البادئات الذكية:
-- 1. START-[UUID] لبدء المرحلة الإنتاجية مباشرة.
-- 2. DONE-[UUID] لإنهاء المرحلة وتحديث التكاليف والكميات مباشرة.
-- 3. [UUID] العادي للتبديل التلقائي (Toggle) بين البدء والإكمال.
-- =================================================================

CREATE OR REPLACE FUNCTION public.mfg_process_scan(p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_progress_id uuid;
    v_current_status text;
    v_order_qty numeric;
    v_production_order_id uuid;
    v_command text := 'TOGGLE'; -- TOGGLE, START, COMPLETE
    v_clean_barcode text;
BEGIN
    v_clean_barcode := trim(p_barcode);
    
    -- التحقق من وجود بادئة الأمر (Prefix)
    IF v_clean_barcode LIKE 'START-%' THEN
        v_command := 'START';
        v_progress_id := substring(v_clean_barcode from 7)::uuid;
    ELSIF v_clean_barcode LIKE 'DONE-%' THEN
        v_command := 'COMPLETE';
        v_progress_id := substring(v_clean_barcode from 6)::uuid;
    ELSE
        v_progress_id := v_clean_barcode::uuid;
    END IF;

    -- جلب الحالة الحالية وكمية الإنتاج لأمر الإنتاج المرتبط
    SELECT op.status, po.quantity_to_produce, op.production_order_id
    INTO v_current_status, v_order_qty, v_production_order_id
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    WHERE op.id = v_progress_id;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة غير موجودة.');
    END IF;

    -- تنفيذ الأمر المطلوب
    IF v_command = 'START' OR (v_command = 'TOGGLE' AND v_current_status = 'pending') THEN
        IF v_current_status != 'pending' THEN
            RETURN jsonb_build_object('success', false, 'message', 'فشل: لا يمكن بدء مرحلة حالتها ليست "قيد الانتظار". حالتها الحالية: ' || v_current_status);
        END IF;

        UPDATE public.mfg_order_progress
        SET status = 'active',
            actual_start_time = now()
        WHERE id = v_progress_id AND status = 'pending';

        RETURN jsonb_build_object('success', true, 'action', 'started', 'message', 'تم بدء العمل على المرحلة بنجاح 🚀');
        
    ELSIF v_command = 'COMPLETE' OR (v_command = 'TOGGLE' AND v_current_status = 'active') THEN
        IF v_current_status != 'active' THEN
            RETURN jsonb_build_object('success', false, 'message', 'فشل: لا يمكن إنهاء مرحلة حالتها ليست "نشطة". حالتها الحالية: ' || v_current_status);
        END IF;

        PERFORM public.mfg_complete_step(v_progress_id, v_order_qty);
        RETURN jsonb_build_object('success', true, 'action', 'completed', 'message', 'تم إكمال المرحلة وتحديث التكاليف والمخازن بنجاح ✅');
        
    ELSIF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة مكتملة بالفعل.');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'حالة المرحلة غير صالحة للعملية.');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'خطأ في معالجة الباركود: ' || SQLERRM);
END; $$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.mfg_process_scan(text) TO authenticated, anon;

-- رسالة تأكيد
SELECT '✅ تم ترقية دالة mfg_process_scan لدعم باركود الأوامر البادئة بنجاح.' as status;
