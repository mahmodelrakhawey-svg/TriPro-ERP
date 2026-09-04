-- ==============================================================================
-- Migration: Full Hypermarket Schema Update for SaaS Multi-Tenant Database
-- التاريخ: 2026-09-04
-- الوصف: إضافة كافة أعمدة الهايبر ماركت وأسعار الجملة وحدود الأسعار وعروض الحزم
-- ==============================================================================

-- 1. إضافة أعمدة الهايبر ماركت المتقدمة لكارت الصنف (products)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_sales_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_stock_level NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS half_wholesale_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS barcode2 TEXT,
ADD COLUMN IF NOT EXISTS is_scale_item BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plu_number INTEGER,
ADD COLUMN IF NOT EXISTS scale_prefix TEXT DEFAULT '22',
ADD COLUMN IF NOT EXISTS shelf_location TEXT,
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tax_rate_override NUMERIC,
ADD COLUMN IF NOT EXISTS unit_barcodes JSONB DEFAULT '[]'::jsonb;

-- 2. فهارس أداء لتسريع البحث بالباركود المزدوج ورقم الميزان والرف
CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON public.products(barcode2);
CREATE INDEX IF NOT EXISTS idx_products_plu ON public.products(plu_number);
CREATE INDEX IF NOT EXISTS idx_products_shelf ON public.products(shelf_location);

-- 3. توثيق الأعمدة
COMMENT ON COLUMN public.products.min_sales_price IS 'الحد الأدنى لسعر البيع لمنع البيع بالخسارة أو بخصم مفرط';
COMMENT ON COLUMN public.products.max_stock_level IS 'الحد الأقصى للمخزون لمنع التكدس وتجاوز طاقة الرفوف';
COMMENT ON COLUMN public.products.wholesale_price IS 'سعر بيع الجملة';
COMMENT ON COLUMN public.products.half_wholesale_price IS 'سعر بيع نصف الجملة';

-- 4. إضافة أعمدة عروض الحزم (صنف أ + صنف ب بسعر مخفض) لجدول العروض (retail_promotions)
ALTER TABLE public.retail_promotions 
ADD COLUMN IF NOT EXISTS secondary_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS secondary_product_name TEXT,
ADD COLUMN IF NOT EXISTS bundle_fixed_price NUMERIC(12,2) DEFAULT 0;

-- 5. تحديث الصلاحيات
GRANT ALL ON public.retail_promotions TO authenticated;
GRANT SELECT ON public.retail_promotions TO anon;
