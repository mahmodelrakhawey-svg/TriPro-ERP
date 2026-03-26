-- =================================================================
-- TriPro ERP - Auto Assign QR Orders to Active Shift
-- التاريخ: 05 إبريل 2026
-- الوصف: تعيين الكاشير المناوب تلقائياً للطلبات الواردة (QR) التي ليس لها مستخدم
-- =================================================================

-- 1. إنشاء الدالة التي ستقوم بالبحث والتعيين
CREATE OR REPLACE FUNCTION public.assign_active_cashier_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_cashier_id UUID;
BEGIN
    -- التحقق: هل الطلب جديد وليس له مستخدم (أو المستخدم هو النظام/Guest)؟
    IF NEW.user_id IS NULL THEN
        
        -- البحث عن الكاشير الذي لديه وردية مفتوحة الآن
        -- المنطق: نختار الوردية المفتوحة (end_time IS NULL)
        -- في حال وجود أكثر من كاشير، نختار آخر من فتح وردية (الأحدث)
        SELECT user_id INTO v_active_cashier_id
        FROM public.shifts
        WHERE end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1;

        -- إذا وجدنا كاشير مناوب، ننسب الطلب له
        IF v_active_cashier_id IS NOT NULL THEN
            NEW.user_id := v_active_cashier_id;
            
            -- (اختياري) إضافة ملاحظة داخلية للنظام
            -- NEW.notes := COALESCE(NEW.notes, '') || ' [Auto-assigned to active shift]';
        END IF;
        
    END IF;

    RETURN NEW;
END;
$$;

-- 2. إنشاء التريجر (المشغل) ليعمل قبل إدخال أي طلب
DROP TRIGGER IF EXISTS trg_auto_assign_cashier ON public.orders;

CREATE TRIGGER trg_auto_assign_cashier
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_active_cashier_to_order();

-- رسالة تأكيد
SELECT '✅ تم تفعيل التعيين التلقائي. أي طلب QR سيتم نسبه للكاشير المناوب حالياً.' as status;
