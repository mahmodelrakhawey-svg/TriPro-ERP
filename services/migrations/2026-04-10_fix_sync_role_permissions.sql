-- =================================================================
-- إصلاح مشكلة تكرار الصلاحيات عند المزامنة (Conflict 409)
-- التاريخ: 10 إبريل 2026
-- الوصف: تحديث دالة sync_role_permissions لتجنب خطأ Unique Violation
-- =================================================================

-- يجب حذف الدالة أولاً إذا كان نوع الإرجاع قد تغير (مثلاً من void إلى JSONB) لتجنب خطأ 42P13
DROP FUNCTION IF EXISTS public.sync_role_permissions(UUID, INT[]);

CREATE OR REPLACE FUNCTION public.sync_role_permissions(
    p_role_id UUID,
    p_permission_ids INT[] -- تأكد من أن النوع مطابق لجدولك (INT أو BIGINT)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- لضمان امتلاك صلاحيات التعديل الكافية
AS $$
BEGIN
    -- 1. حذف كافة الصلاحيات الحالية المرتبطة بهذا الدور
    -- هذه الخطوة ضرورية لضمان أن الصلاحيات النهائية هي فقط ما تم إرساله في المصفوفة
    DELETE FROM public.role_permissions
    WHERE role_id = p_role_id;

    -- 2. إدخال الصلاحيات الجديدة
    -- نستخدم unnest لتحويل المصفوفة إلى أسطر لسهولة الإدخال
    IF p_permission_ids IS NOT NULL AND array_length(p_permission_ids, 1) > 0 THEN
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT p_role_id, elem
        FROM unnest(p_permission_ids) AS elem
        ON CONFLICT (role_id, permission_id) DO NOTHING; -- حماية إضافية ضد وجود قيم مكررة في المصفوفة المرسلة
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Permissions synced successfully');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;