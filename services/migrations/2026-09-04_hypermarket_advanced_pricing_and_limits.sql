-- Migration: Add advanced pricing tiers and stock limits to products
-- Date: 2026-09-04
-- For SaaS multi-tenant database (TriPro ERP)

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_sales_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_stock_level NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS half_wholesale_price NUMERIC DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN public.products.min_sales_price IS 'الحد الأدنى لسعر البيع لمنع البيع بالخسارة أو بخصم مفرط';
COMMENT ON COLUMN public.products.max_stock_level IS 'الحد الأقصى للمخزون لمنع التكدس وتجاوز طاقة الرفوف';
COMMENT ON COLUMN public.products.wholesale_price IS 'سعر بيع الجملة';
COMMENT ON COLUMN public.products.half_wholesale_price IS 'سعر بيع نصف الجملة';
