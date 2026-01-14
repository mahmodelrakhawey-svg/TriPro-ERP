-- إضافة عمود رقم الفاتورة الأصلية لجداول الإشعارات

ALTER TABLE public.credit_notes 
ADD COLUMN IF NOT EXISTS original_invoice_number text;

ALTER TABLE public.debit_notes 
ADD COLUMN IF NOT EXISTS original_invoice_number text;