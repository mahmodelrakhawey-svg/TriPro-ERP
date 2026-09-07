-- إضافة عمود لتحديد ما إذا كانت المصاريف غير المباشرة نسبة مئوية
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_overhead_percentage BOOLEAN DEFAULT false;