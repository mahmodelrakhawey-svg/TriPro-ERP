-- =================================================================
-- إصلاح مشكلة تكرار الصلاحيات عند المزامنة والتعارض في الدوال (PGRST203)
-- التاريخ: 10 إبريل 2026 (تحديث: 5 يوليو 2026)
-- الوصف: تحديث دالة sync_role_permissions لتستخدم UUID[] ودعم الأمان والـ ON CONFLICT
-- =================================================================

-- 1. حذف الدوال القديمة لتجنب تعارض الحمولة الزائدة (Overloading Conflict)
DROP FUNCTION IF EXISTS public.sync_role_permissions(uuid, integer[]);
DROP FUNCTION IF EXISTS public.sync_role_permissions(uuid, uuid[]);

-- 2. إعادة إنشاء الدالة بالنمط الصحيح والآمن
CREATE OR REPLACE FUNCTION public.sync_role_permissions(
    p_role_id uuid,
    p_permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- لضمان امتلاك صلاحيات التعديل الكافية وتخطي قيود الـ RLS
AS $$
DECLARE
    v_org_id uuid;
    v_role_name text;
BEGIN
    -- أ. جلب معلومات الدور المستهدف لضمان الأمان
    SELECT organization_id, name INTO v_org_id, v_role_name 
    FROM public.roles 
    WHERE id = p_role_id;
    
    -- ب. 🛡️ التحقق من الصلاحيات: السماح للسوبر أدمن بالمزامنة لأي شركة، أو للمستخدم العادي ضمن شركته فقط
    IF v_org_id IS NULL OR (v_org_id != public.get_my_org() AND public.get_my_role() != 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل صلاحيات هذا الدور.';
    END IF;

    -- ج. 🛡️ حماية دور الأدمن: منع المدير من سحب صلاحية "إدارة الصلاحيات" عن نفسه
    IF v_role_name = 'admin' AND public.get_my_role() != 'super_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.permissions 
            WHERE id = ANY(p_permission_ids) AND module = 'admin' AND action = 'manage'
        ) THEN
            RAISE EXCEPTION 'تحذير أمني: لا يمكنك سحب صلاحية "إدارة الصلاحيات" من دور المدير لضمان استمرار قدرتك على إدارة النظام.';
        END IF;
    END IF;

    -- د. مسح الصلاحيات الحالية (ضمن معاملة واحدة)
    DELETE FROM public.role_permissions 
    WHERE role_id = p_role_id AND organization_id = v_org_id;

    -- هـ. إضافة الصلاحيات الجديدة مع تجنب التكرار واستخدام ON CONFLICT
    IF p_permission_ids IS NOT NULL AND array_length(p_permission_ids, 1) > 0 THEN
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT DISTINCT p_role_id, elem, v_org_id
        FROM unnest(p_permission_ids) AS elem
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END IF;
END;
$$;

-- 3. تحديث ذاكرة التخزين المؤقت لـ PostgREST
NOTIFY pgrst, 'reload schema';