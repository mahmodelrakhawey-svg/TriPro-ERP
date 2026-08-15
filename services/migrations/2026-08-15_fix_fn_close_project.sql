-- ==============================================================================
-- 🚀 إصلاح دالة إغلاق المشروع (Fix Project Closing Function)
-- التاريخ: 15 أغسطس 2026
-- ==============================================================================

-- 1. التأكد من سلامة دالة إغلاق المشروع
CREATE OR REPLACE FUNCTION public.fn_close_project(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project RECORD;
    v_open_customer_billings INT := 0;
    v_open_sub_billings INT := 0;
    v_open_custody_exp INT := 0;
    v_total_revenue NUMERIC := 0;
    v_total_costs NUMERIC := 0;
    v_profit_loss NUMERIC := 0;
BEGIN
    -- 1. التحقق من وجود المشروع
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF v_project IS NULL THEN
        RAISE EXCEPTION 'المشروع غير موجود.';
    END IF;

    IF v_project.status = 'completed' THEN 
        RETURN jsonb_build_object('status', 'success', 'message', 'المشروع مغلق بالفعل.'); 
    END IF;

    -- 2. التحقق من عدم وجود مستخلصات عملاء معلقة (مسودة)
    SELECT COUNT(*) INTO v_open_customer_billings 
    FROM public.project_progress_billings 
    WHERE project_id = p_project_id AND status = 'draft';

    IF v_open_customer_billings > 0 THEN 
        RAISE EXCEPTION '⚠️ لا يمكن إغلاق المشروع: يوجد عدد (%) مستخلص عميل معلق (مسودة). يرجى اعتمادها أو حذفها أولاً.', v_open_customer_billings; 
    END IF;

    -- 3. التحقق من عدم وجود مستخلصات مقاولي باطن معلقة (مسودة)
    SELECT COUNT(*) INTO v_open_sub_billings 
    FROM public.subcontractor_billings sb 
    JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id 
    WHERE sc.project_id = p_project_id AND sb.status = 'draft';

    IF v_open_sub_billings > 0 THEN 
        RAISE EXCEPTION '⚠️ لا يمكن إغلاق المشروع: يوجد عدد (%) مستخلص مقاول باطن معلق (مسودة). يرجى اعتمادها أولاً.', v_open_sub_billings; 
    END IF;

    -- 4. التحقق من عدم وجود مصاريف عهد معلقة (مسودة)
    SELECT COUNT(*) INTO v_open_custody_exp 
    FROM public.project_custody_expenses pce 
    JOIN public.project_custodies pc ON pce.custody_id = pc.id 
    WHERE pc.project_id = p_project_id AND pce.status = 'draft';

    IF v_open_custody_exp > 0 THEN 
        RAISE EXCEPTION '⚠️ لا يمكن إغلاق المشروع: يوجد عدد (%) مصروف عهدة معلق (مسودة). يرجى اعتماده أولاً.', v_open_custody_exp; 
    END IF;

    -- 5. احتساب الأرباح الختامية للمشروع بدقة
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_total_revenue 
    FROM public.project_progress_billings 
    WHERE project_id = p_project_id AND status = 'approved';

    IF v_project.cost_center_account_id IS NOT NULL THEN
        SELECT COALESCE(SUM(debit), 0) INTO v_total_costs 
        FROM public.journal_lines 
        WHERE account_id = v_project.cost_center_account_id;
    END IF;

    v_profit_loss := v_total_revenue - v_total_costs;

    -- 6. تحديث حالة المشروع إلى مكتمل
    UPDATE public.projects 
    SET status = 'completed', 
        end_date = COALESCE(end_date, CURRENT_DATE),
        updated_at = NOW() 
    WHERE id = p_project_id;

    RETURN jsonb_build_object(
        'status', 'success', 
        'message', 'تم إغلاق المشروع بنجاح وتحديث حالته إلى مكتمل ✅', 
        'final_profit', v_profit_loss,
        'total_revenue', v_total_revenue,
        'total_costs', v_total_costs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_close_project(UUID) TO authenticated;
