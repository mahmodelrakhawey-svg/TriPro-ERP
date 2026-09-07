-- =================================================================
-- TriPro ERP - Add Unit Column to Products
-- التاريخ: 16 مارس 2026
-- الوصف: إضافة حقل "الوحدة" لجدول الأصناف.
-- =================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'قطعة';

COMMENT ON COLUMN public.products.unit IS 'The unit of measure for the product (e.g., piece, kg, box).';

-- This command forces PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';