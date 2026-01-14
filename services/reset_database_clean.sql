-- 🧹 ملف تنظيف قاعدة البيانات (Reset Data)
-- الغرض: حذف جميع البيانات التشغيلية (فواتير، قيود، عملاء، منتجات)
-- مع الحفاظ على الهيكل الأساسي (المستخدمين، الصلاحيات، دليل الحسابات، الإعدادات).
-- ⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!

BEGIN;

-- 1. حذف العمليات المالية والمخزنية (الترتيب مهم بسبب القيود Foreign Keys)
DELETE FROM public.security_logs;
DELETE FROM public.journal_lines;
DELETE FROM public.journal_entries;
DELETE FROM public.receipt_vouchers;
DELETE FROM public.payment_vouchers;
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;
DELETE FROM public.purchase_invoice_items; -- إذا وجد
DELETE FROM public.purchase_invoices;      -- إذا وجد
DELETE FROM public.stock_transfer_items;   -- إذا وجد
DELETE FROM public.stock_transfers;        -- إذا وجد
DELETE FROM public.stock_adjustment_items; -- إذا وجد
DELETE FROM public.stock_adjustments;      -- إذا وجد

-- 2. حذف البيانات الأساسية (Entities)
DELETE FROM public.products;
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.warehouses;
DELETE FROM public.assets;
DELETE FROM public.cheques;
DELETE FROM public.employees;
DELETE FROM public.payrolls;

COMMIT;

SELECT 'تم تنظيف قاعدة البيانات بنجاح! النظام جاهز للبدء من الصفر 🧹' as result;