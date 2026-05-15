-- إضافة عمود لربط الحسابات في إعدادات الشركة
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS account_mappings jsonb DEFAULT '{}'::jsonb;