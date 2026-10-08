-- =============================================================================
-- ملف هجرة قاعدة البيانات | Database Migration File
-- =============================================================================
-- الملف   : 2026-10-08_add_salary_compatibility_to_employees.sql
-- التاريخ : 2026-10-08
-- الأولوية: عادية / توافقية (Backward Compatibility)
-- المشروع : TriPro-ERP
-- -----------------------------------------------------------------------------
-- الغرض:
-- إضافة عمود salary المتوافق مع basic_salary في جدول الموظفين employees ومزامنتها تلقائياً.
-- يمنع خطأ 400 Bad Request من PostgREST عند إرسال salary بدلاً من basic_salary من أي واجهة قديمة أو جوال.
-- =============================================================================

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS salary numeric;
UPDATE public.employees SET salary = basic_salary WHERE salary IS NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_employee_names()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- مزامنة الاسم الكامل والاسم المختصر
    NEW.full_name := COALESCE(NEW.full_name, NEW.name);
    NEW.name := COALESCE(NEW.name, NEW.full_name);
    
    -- مزامنة الراتب بين basic_salary و salary تلقائياً
    IF NEW.basic_salary IS NULL AND NEW.salary IS NOT NULL THEN
        NEW.basic_salary := NEW.salary;
    ELSIF NEW.salary IS NULL AND NEW.basic_salary IS NOT NULL THEN
        NEW.salary := NEW.basic_salary;
    ELSIF NEW.basic_salary IS NOT NULL THEN
        NEW.salary := NEW.basic_salary;
    END IF;
    
    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '✅ تم بنجاح إضافة عمود salary وتفعيل المزامنة التلقائية مع basic_salary.';
    RAISE NOTICE '=================================================================';
END $$;
