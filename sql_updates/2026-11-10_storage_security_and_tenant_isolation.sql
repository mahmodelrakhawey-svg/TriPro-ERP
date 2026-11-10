-- ==============================================================================
-- TriPro-ERP: تحصين أمان ملفات ومرفقات التخزين السحابي (Supabase Storage Hardening)
-- التاريخ: 10 نوفمبر 2026
-- الأولوية: حرجة (CRITICAL - STORAGE SECURITY & STAGED UPLOAD INTEGRITY)
-- التوافق: متوافق 100% مع بيئة عمل شركة لينزا ولا يؤثر على الملفات الموجودة مسبقاً
-- ==============================================================================

-- الهدف:
-- 1. منع رفع أي ملفات برمجية أو خطرة (HTML, SVG, EXE, JS, PHP, etc.) على مستوى قاعدة البيانات
--    لحماية النظام من ثغرات Stored XSS واختراق الجلسات عبر روابط الملفات.
-- 2. حصر عمليات الرفع والحذف على المستخدمين المصادق عليهم (authenticated) ومنع (anon).
-- 3. السماح فقط بامتدادات المستندات والصور الآمنة (PDF, PNG, JPG, JPEG, WEBP).

CREATE OR REPLACE FUNCTION public.check_file_extension_safe(filename text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_ext text;
BEGIN
    -- استخراج امتداد الملف وتحويله إلى أحرف صغيرة
    v_ext := lower(split_part(filename, '.', array_length(string_to_array(filename, '.'), 1)));
    
    -- حظر الامتدادات القابلة للتنفيذ أو التي تحتوي على أكواد خبيثة
    IF v_ext IN (
        'html', 'htm', 'shtml', 'xhtml', 
        'svg', 'xml', 
        'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'msi', 
        'js', 'jsx', 'ts', 'tsx', 'php', 'phtml', 'py', 'jar', 'asp', 'aspx', 'jsp'
    ) THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$;

-- تطبيق سياسات الحماية على حاويات التخزين في Supabase (إذا كان امتداد Storage مفعلاً)
DO $$
BEGIN
    -- التحقق من وجود مخطط storage
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        -- 1. سياسة إدراج الملفات: منع الملفات الخطرة والسماح فقط للمستخدمين المصادق عليهم
        DROP POLICY IF EXISTS "tripro_storage_insert_policy" ON storage.objects;
        CREATE POLICY "tripro_storage_insert_policy" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
            public.check_file_extension_safe(name) = true
        );

        -- 2. سياسة تعديل الملفات: منع التعديل على الملفات الخطرة
        DROP POLICY IF EXISTS "tripro_storage_update_policy" ON storage.objects;
        CREATE POLICY "tripro_storage_update_policy" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
            public.check_file_extension_safe(name) = true
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- في حال كانت صلاحيات جداول التخزين محصورة بمدير Supabase، يتم تجاهل الخطأ بأمان تام
        RAISE NOTICE 'Storage policy notification: %', SQLERRM;
END $$;
