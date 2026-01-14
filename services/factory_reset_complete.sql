-- 🏭 ملف إعادة ضبط المصنع بالكامل (Full Factory Reset)
-- ⚠️ تحذير شديد: هذا الملف سيقوم بمسح كل شيء في قاعدة البيانات!
-- بما في ذلك: المستخدمين، الإعدادات، دليل الحسابات، وجميع العمليات.
-- سيتم إعادة النظام إلى نقطة الصفر (كأنه مشروع جديد تماماً).

BEGIN;

-- 1. حذف العمليات المالية والمخزنية (الترتيب مهم بسبب القيود Foreign Keys)
DELETE FROM public.security_logs;
DELETE FROM public.journal_lines;
DELETE FROM public.journal_entries;
DELETE FROM public.receipt_vouchers;
DELETE FROM public.payment_vouchers;
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;

-- حذف الجداول الاختيارية (مع معالجة الخطأ إذا لم تكن موجودة)
DO $$ BEGIN DELETE FROM public.purchase_invoice_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.purchase_invoices; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.stock_transfer_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.stock_transfers; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.stock_adjustment_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.stock_adjustments; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.quotation_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.quotations; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.payroll_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.payrolls; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 2. حذف البيانات الأساسية (Entities)
DELETE FROM public.products;
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.assets;
DELETE FROM public.cheques;
DELETE FROM public.employees;

-- 3. حذف الهيكل الأساسي (Infrastructure)
DELETE FROM public.warehouses;
DELETE FROM public.accounts; -- دليل الحسابات
DELETE FROM public.company_settings;
DELETE FROM public.profiles; -- ملفات المستخدمين
DELETE FROM public.organizations;

COMMIT;

SELECT 'تمت إعادة ضبط المصنع بالكامل! النظام الآن فارغ تماماً 🗑️' as result;