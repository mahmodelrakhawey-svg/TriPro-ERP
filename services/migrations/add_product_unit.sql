-- إضافة عمود وحدة القياس إلى جدول المنتجات
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'piece';

COMMENT ON COLUMN public.products.unit IS 'وحدة القياس (قطعة، كجم، لتر، مللي، عدد، إلخ)';