-- ==============================================================================
-- Migration: إضافة عمود updated_at إلى جدول products
-- التاريخ: 2026-08-28
-- السبب: مطلوب لتتبع آخر تعديل على الصنف (تكلفة، رصيد، سعر)
-- ==============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- تحديث القيمة للسجلات الموجودة
UPDATE public.products
SET updated_at = created_at
WHERE updated_at IS NULL;

-- إنشاء Trigger لتحديثه تلقائياً عند كل UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS 
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
 LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- تحقق
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'updated_at';
