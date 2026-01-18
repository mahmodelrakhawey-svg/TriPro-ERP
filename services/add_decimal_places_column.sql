-- إضافة عمود عدد الكسور العشرية في جدول إعدادات الشركة
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;