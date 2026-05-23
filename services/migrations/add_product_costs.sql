-- إضافة أعمدة لتكلفة العمالة والمصروفات غير المباشرة
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS labor_cost DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS overhead_cost DOUBLE PRECISION DEFAULT 0;