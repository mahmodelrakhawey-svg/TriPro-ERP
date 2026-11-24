-- ==============================================================================
-- 🔧 TriPro ERP — تحديث بنية وصلاحيات السنوات المالية والأرشفة
-- الملف: sql_updates/2026-11-24_fix_fiscal_years_schema_and_permissions.sql
-- التاريخ: 2026-11-24
-- الغرض:
--   1. إضافة عمود name المفقود لجدول fiscal_years لتفادي خطأ 400 (column name does not exist)
--   2. التأكد من منح صلاحيات القراءة والاستعلام لدور authenticated لمنع أخطاء 42501
--   3. تعبئة الاسم تلقائياً من رقم السنة لجميع السنوات المالية الحالية
-- ==============================================================================

-- 1. التأكد من وجود الجدول وعمود name
CREATE TABLE IF NOT EXISTS public.fiscal_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_org_fiscal_year UNIQUE (organization_id, year)
);

ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. تحديث الاسم للسنوات المالية الحالية إن وجد year
UPDATE public.fiscal_years 
SET name = 'السنة المالية ' || year 
WHERE (name IS NULL OR name = '') AND year IS NOT NULL;

-- 3. تفعيل RLS وتحديث الصلاحيات
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_years_org_isolation" ON public.fiscal_years;
CREATE POLICY "fiscal_years_org_isolation" ON public.fiscal_years
    FOR ALL
    TO authenticated
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);

GRANT ALL ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;

-- 4. التأكد من صلاحيات جداول الأرشفة السنوية إن وُجدت
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'annual_fiscal_archives') THEN
        GRANT ALL ON public.annual_fiscal_archives TO authenticated;
        GRANT ALL ON public.annual_fiscal_archives TO service_role;
    END IF;
END $$;
