-- إضافة عمود الحد الأقصى للعجز في جدول إعدادات الشركة
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS max_cash_deficit_limit numeric DEFAULT 500;