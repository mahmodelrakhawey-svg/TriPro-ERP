-- 🛠️ تحديث جدول المنتجات (Review and Update Products Table)
-- إضافة الأعمدة المفقودة لضمان توافق النظام مع نظام الإشعارات والتقارير

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; -- مطلوب لنظام الإشعارات الذكية

COMMIT;