-- =================================================================
-- TriPro ERP - Restaurant Module Functions
-- التاريخ: 26 يناير 2026
-- هذا الملف يحتوي على الدوال البرمجية (RPC) الخاصة بوحدة المطاعم
-- =================================================================

-- دالة لفتح جلسة جديدة على طاولة
-- تقوم بالتحقق من حالة الطاولة، ثم تحديثها إلى "مشغولة" وإنشاء سجل جلسة جديد
-- وتعيد معرّف الجلسة الجديدة
CREATE OR REPLACE FUNCTION open_table_session(p_table_id uuid, p_user_id uuid)
RETURNS uuid -- returns the new session id
LANGUAGE plpgsql
AS $$
DECLARE
    new_session_id uuid;
    rows_affected integer;
BEGIN
    -- 1. تحديث حالة الطاولة ذرياً (فقط إذا كانت متاحة) والتحقق من النتيجة
    WITH updated AS (
        UPDATE public.restaurant_tables
        SET status = 'OCCUPIED', updated_at = now()
        WHERE id = p_table_id AND status = 'AVAILABLE'
        RETURNING id
    )
    SELECT count(*) INTO rows_affected FROM updated;

    -- 2. إذا لم يتم تحديث أي صف، فهذا يعني أن الطاولة غير موجودة أو غير متاحة
    IF rows_affected = 0 THEN
        -- نتحقق من السبب الدقيق لإعطاء رسالة خطأ واضحة
        PERFORM 1 FROM public.restaurant_tables WHERE id = p_table_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'الطاولة غير موجودة. (ID: %)', p_table_id;
        ELSE
            RAISE EXCEPTION 'الطاولة ليست متاحة (قد تكون مشغولة أو محجوزة).';
        END IF;
    END IF;

    -- 3. إنشاء جلسة جديدة (فقط إذا نجح تحديث الطاولة)
    INSERT INTO public.table_sessions (table_id, user_id, status)
    VALUES (p_table_id, p_user_id, 'OPEN')
    RETURNING id INTO new_session_id;


    RETURN new_session_id;
END;
$$;