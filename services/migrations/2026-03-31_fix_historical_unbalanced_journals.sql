-- =================================================================
-- إصلاح القيود التاريخية غير المتوازنة
-- التاريخ: 31 مارس 2026
-- الوصف: دالة لإصلاح قيد غير متوازن، وسكربت لتطبيقها بشكل جماعي.
-- =================================================================

-- الخطوة 1: إنشاء الدالة التي تقوم بإصلاح قيد واحد
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_journal_entry_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_debits NUMERIC := 0;
    v_total_credits NUMERIC := 0;
    v_difference NUMERIC := 0;
    v_settlement_acc_id UUID;
    v_entry RECORD;
BEGIN
    -- 1. جلب القيد والتحقق من وجوده
    SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_journal_entry_id;
    IF NOT FOUND THEN
        RETURN 'خطأ: القيد غير موجود.';
    END IF;

    -- 2. حساب المجاميع الحالية
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debits, v_total_credits
    FROM public.journal_lines
    WHERE journal_entry_id = p_journal_entry_id;

    v_difference := v_total_debits - v_total_credits;

    -- 3. التحقق إذا كان متوازناً بالفعل
    IF ABS(v_difference) < 0.01 THEN
        RETURN 'متوازن بالفعل. لا يوجد إجراء مطلوب.';
    END IF;

    -- 4. إضافة سطر التسوية
    IF v_difference > 0 THEN
        -- الطرف المدين أكبر، نحتاج لإضافة سطر دائن
        -- الأولوية لحساب الضريبة (2231) إذا كان قيد وردية
        IF v_entry.reference LIKE 'SHIFT-%' THEN
            SELECT id INTO v_settlement_acc_id FROM public.accounts WHERE code = '2231' LIMIT 1; -- ضريبة القيمة المضافة
        END IF;
        -- إذا لم يكن قيد وردية أو لم يوجد حساب الضريبة، نستخدم حساب تسوية عام
        IF v_settlement_acc_id IS NULL THEN
            SELECT id INTO v_settlement_acc_id FROM public.accounts WHERE code = '421' LIMIT 1; -- إيرادات متنوعة (للتسوية الدائنة)
        END IF;

        IF v_settlement_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
            VALUES (p_journal_entry_id, v_settlement_acc_id, 0, v_difference, 'تسوية تلقائية للرصيد');
            RETURN 'تم الإصلاح. أُضيف سطر دائن بقيمة: ' || v_difference;
        ELSE
            RETURN 'خطأ: لم يتم العثور على حساب تسوية مناسب (2231 أو 421).';
        END IF;
    ELSE -- v_difference < 0
        -- الطرف الدائن أكبر، نحتاج لإضافة سطر مدين
        SELECT id INTO v_settlement_acc_id FROM public.accounts WHERE code = '541' LIMIT 1; -- تسوية عجز الصندوق (للتسوية المدينة)

        IF v_settlement_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
            VALUES (p_journal_entry_id, v_settlement_acc_id, ABS(v_difference), 0, 'تسوية تلقائية للرصيد');
            RETURN 'تم الإصلاح. أُضيف سطر مدين بقيمة: ' || ABS(v_difference);
        ELSE
            RETURN 'خطأ: لم يتم العثور على حساب تسوية مناسب (541).';
        END IF;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RETURN 'حدث خطأ غير متوقع: ' || SQLERRM;
END;
$$;

-- الخطوة 2: سكربت مساعد لتشغيل الإصلاح على كل القيود غير المتوازنة
-- يمكنك تشغيل هذا الجزء بعد التأكد من عمل الدالة أعلاه بشكل صحيح
/*
DO $$
DECLARE
    unbalanced_entry RECORD;
    fix_result TEXT;
BEGIN
    RAISE NOTICE '--- بدء عملية إصلاح القيود التاريخية غير المتوازنة ---';
    FOR unbalanced_entry IN
        SELECT je.id, je.reference FROM public.journal_entries je
        WHERE je.id IN (
            SELECT journal_entry_id FROM public.journal_lines GROUP BY journal_entry_id HAVING ABS(SUM(debit) - SUM(credit)) >= 0.01
        )
    LOOP
        SELECT public.fix_unbalanced_journal_entry(unbalanced_entry.id) INTO fix_result;
        RAISE NOTICE 'إصلاح القيد % (Ref: %): %', unbalanced_entry.id, unbalanced_entry.reference, fix_result;
    END LOOP;
    RAISE NOTICE '--- انتهت عملية الإصلاح ---';
END;
$$;
*/

SELECT '✅ تم إنشاء دالة إصلاح القيود بنجاح. يمكنك الآن استخدامها أو تفعيل السكربت المساعد.' as status;