-- إضافة عمود الصورة لجدول التصنيفات
ALTER TABLE public.item_categories 
ADD COLUMN IF NOT EXISTS image_url TEXT;