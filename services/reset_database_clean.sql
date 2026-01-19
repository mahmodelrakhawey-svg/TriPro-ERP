-- 🧹 ملف تنظيف قاعدة البيانات (Reset Data)
-- 🧹 ملف تنظيف قاعدة البيانات (Reset Data) - نسخة محدثة وشاملة
-- 🧹 ملف تنظيف قاعدة البيانات (Reset Data) - النسخة النهائية الشاملة
-- الغرض: حذف جميع البيانات التشغيلية (فواتير، قيود، عملاء، منتجات)
-- مع الحفاظ على الهيكل الأساسي (المستخدمين، الصلاحيات، دليل الحسابات، الإعدادات).
-- ⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!

BEGIN;

-- 1. حذف المرفقات (Attachments)
DELETE FROM public.journal_attachments;
-- استخدام جمل شرطية للجداول التي قد لا تكون موجودة لتجنب توقف السكربت
DO $$ BEGIN DELETE FROM public.cheque_attachments; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.receipt_voucher_attachments; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.payment_voucher_attachments; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 2. حذف تفاصيل العمليات (Items/Lines)
DELETE FROM public.journal_lines;
DO $$ BEGIN DELETE FROM public.journal_entry_lines; EXCEPTION WHEN undefined_table THEN NULL; END $$; -- جدول قديم محتمل
DELETE FROM public.invoice_items;
DELETE FROM public.sales_return_items;
DELETE FROM public.purchase_invoice_items;
DELETE FROM public.purchase_return_items;
DELETE FROM public.quotation_items;
DELETE FROM public.purchase_order_items;
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_adjustment_items;
DELETE FROM public.inventory_count_items;
DELETE FROM public.payroll_items;
DELETE FROM public.bill_of_materials;
DO $$ BEGIN DELETE FROM public.work_order_costs; EXCEPTION WHEN undefined_table THEN NULL; END $$; -- تكاليف التصنيع

-- 3. حذف العمليات الرئيسية (Transactions/Documents)
-- يجب حذف المستندات التي تشير إلى القيود قبل حذف القيود نفسها
DELETE FROM public.sales_returns;
DELETE FROM public.purchase_returns;
DELETE FROM public.invoices;
DELETE FROM public.purchase_invoices;
DELETE FROM public.quotations;
DELETE FROM public.purchase_orders;
DELETE FROM public.credit_notes;
DELETE FROM public.debit_notes;
DELETE FROM public.stock_transfers;
DELETE FROM public.stock_adjustments;
DELETE FROM public.inventory_counts;
DELETE FROM public.receipt_vouchers;
DELETE FROM public.payment_vouchers;
DELETE FROM public.cheques;
DELETE FROM public.payrolls;
DELETE FROM public.opening_inventories;

-- جداول إضافية تم اكتشافها في قاعدة البيانات
DO $$ BEGIN DELETE FROM public.bank_reconciliations; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.cash_closings; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.employee_advances; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.payroll_runs; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.transfers; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.vouchers; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.work_orders; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 4. حذف القيود اليومية والسجلات
DELETE FROM public.journal_entries;
DELETE FROM public.security_logs;
DELETE FROM public.notifications;
DO $$ BEGIN DELETE FROM public.rejected_cash_closings; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 5. حذف البيانات الأساسية (Master Data)
DELETE FROM public.products;
DO $$ BEGIN DELETE FROM public.item_categories; EXCEPTION WHEN undefined_table THEN NULL; END $$; -- تصنيفات الأصناف
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.assets;
DELETE FROM public.employees;
DELETE FROM public.budgets;
-- نحذف المستودعات أخيراً لأن بعض الجداول قد تشير إليها
DELETE FROM public.warehouses;

-- ملاحظة: لا نحذف accounts, cost_centers, organizations, company_settings, profiles

-- 6. ضمان وجود بروفايل للمدير العام الافتراضي (System Admin)
-- هذا يضمن وجود مستخدم بصلاحيات كاملة حتى لو تم مسح المستخدمين بالخطأ
DO $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES ('00000000-0000-0000-0000-000000000000', 'المدير العام', 'super_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE '⚠️ لم يتم إنشاء بروفايل المدير العام الافتراضي لأن المستخدم غير موجود في جدول المصادقة.';
END $$;

COMMIT;

SELECT 'تم تنظيف قاعدة البيانات بنجاح! النظام جاهز للبدء من الصفر 🧹' as result;