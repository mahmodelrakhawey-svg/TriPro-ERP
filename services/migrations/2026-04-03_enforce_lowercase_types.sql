-- =================================================================
-- فرض حالة الأحرف الصغيرة لأنواع الحسابات (Data Integrity)
-- التاريخ: 03 إبريل 2026
-- الوصف: تحويل نوع الحساب تلقائياً إلى lowercase عند الإدخال أو التعديل
-- =================================================================

-- 1. إنشاء دالة التحويل
CREATE OR REPLACE FUNCTION public.enforce_lowercase_account_type()
RETURNS TRIGGER AS $$
BEGIN
    NEW.type := LOWER(NEW.type);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. ربط الدالة بجدول الحسابات (Trigger)
DROP TRIGGER IF EXISTS trg_enforce_lowercase_account_type ON public.accounts;

CREATE TRIGGER trg_enforce_lowercase_account_type
BEFORE INSERT OR UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lowercase_account_type();

SELECT '✅ تم تفعيل الحماية. أي نوع حساب سيتم حفظه بحروف صغيرة تلقائياً.' as status;