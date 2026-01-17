-- 🛠️ إضافة أعمدة العملة وسعر الصرف لجداول السندات
-- ضروري لعمل دوال الاعتماد بشكل صحيح

ALTER TABLE public.receipt_vouchers 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;

ALTER TABLE public.payment_vouchers 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;