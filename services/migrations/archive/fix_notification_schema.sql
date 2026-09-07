--- /dev/null
-- c:/Users/pc/Desktop/TriPro-ERP/services/fix_notification_schema.sql
--@@ -0,0 +1,10 @@
-- إصلاح خطأ نظام الإشعارات (400 Bad Request)
-- يضيف الأعمدة المفقودة التي يحتاجها نظام الإشعارات في جدول فواتير المشتريات

ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id);

-- مزامنة المرجع مع رقم الفاتورة للسجلات الموجودة
UPDATE public.purchase_invoices 
SET reference = invoice_number 
WHERE reference IS NULL;
