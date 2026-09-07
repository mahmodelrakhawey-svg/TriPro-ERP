-- =================================================================
-- TriPro ERP - Fix Missing Sales Account Issue
-- التاريخ: 06 إبريل 2026
-- الوصف: إصلاح بيانات الطلبات (Subtotal = 0) وإعادة توليد قيد الوردية الخاطئ
-- =================================================================

-- 1. تصحيح بيانات الطلبات (Fix Orders Data)
-- المشكلة: بعض الطلبات (QR) تم حفظها وضريبة القيمة المضافة تساوي إجمالي المبلغ، والمبيعات صفر.
-- الحل: إعادة احتساب الضريبة والمبيعات بناءً على نسبة 15% (KSA/UAE Standard)

UPDATE public.orders
SET 
    subtotal = ROUND((grand_total / 1.15), 2),
    total_tax = grand_total - ROUND((grand_total / 1.15), 2)
WHERE 
    subtotal <= 0       -- الطلبات التي ليس بها مبيعات
    AND grand_total > 0 -- ولكن لها قيمة إجمالية
    AND status = 'COMPLETED';

-- رسالة للتأكد
DO $$
BEGIN
    RAISE NOTICE '✅ تم تصحيح بيانات الطلبات الخاطئة.';
END $$;

-- 2. إعادة توليد القيد المحاسبي للوردية المحددة (Regenerate Journal Entry)
DO $$
DECLARE
    v_journal_id UUID;
    v_shift_id UUID;
BEGIN
    -- البحث عن القيد باستخدام المرجع المذكور (SHIFT-403acf36)
    SELECT id INTO v_journal_id FROM public.journal_entries WHERE reference LIKE '%403acf36%';
    
    IF v_journal_id IS NOT NULL THEN
        -- أ. معرفة الوردية المرتبطة بهذا القيد (البحث في كلا العمودين المحتملين)
        SELECT id INTO v_shift_id FROM public.shifts 
        WHERE related_journal_entry_id = v_journal_id OR closing_entry_id = v_journal_id
        LIMIT 1;
        
        -- ج. فك ارتباط الوردية أولاً من جميع الأعمدة (لإتاحة الحذف وتجنب خطأ FK constraint)
        UPDATE public.shifts SET related_journal_entry_id = NULL WHERE related_journal_entry_id = v_journal_id;
        UPDATE public.shifts SET closing_entry_id = NULL WHERE closing_entry_id = v_journal_id;
        
        -- ب. حذف القيد القديم الخاطئ وتفاصيله
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
        
        -- د. استدعاء دالة إغلاق الوردية لإنشاء قيد جديد بناءً على البيانات المصححة
        PERFORM public.generate_shift_closing_entry(v_shift_id);
        
        RAISE NOTICE '✅ تم حذف القيد القديم وإنشاء قيد جديد صحيح للوردية.';
    ELSE
        RAISE NOTICE '⚠️ لم يتم العثور على القيد المحدد (SHIFT-403acf36). ربما تم حذفه يدوياً؟';
    END IF;
END $$;