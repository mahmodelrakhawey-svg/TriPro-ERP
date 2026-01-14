-- إضافة عمود طريقة الدفع لجداول السندات

ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';

ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';