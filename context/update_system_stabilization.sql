-- 🛡️ ملف استقرار النظام - TriPro ERP Stabilization
-- 📅 تاريخ التحديث: 2026-06-18
-- 🎯 الهدف: تحسين الأداء وحماية بيانات تعدد المستأجرين (SaaS)

BEGIN;

-- 1. تحسين الأداء: إنشاء فهارس (Indexes) لضمان سرعة البحث بـ organization_id
-- الفهارس تمنع بطء النظام مع زيادة عدد العملاء
CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON public.journal_entries (organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org ON public.journal_lines (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers (organization_id);

-- تحسين أداء مديول التصنيع (MFG)
CREATE INDEX IF NOT EXISTS idx_mfg_orders_org ON public.mfg_production_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_mfg_progress_status ON public.mfg_order_progress (status, organization_id);
CREATE INDEX IF NOT EXISTS idx_mfg_bom_product ON public.bill_of_materials (product_id);
CREATE INDEX IF NOT EXISTS idx_comp_settings_org ON public.company_settings (organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON public.journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_mfg_requests_order ON public.mfg_material_requests (production_order_id);

-- 2. صمام أمان: دالة لمنع حذف الحسابات التي لها حركات مالية
CREATE OR REPLACE FUNCTION public.check_account_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.journal_lines WHERE account_id = OLD.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب لأنه يحتوي على قيود محاسبية مسجلة. يرجى أرشفته بدلاً من حذفه.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_used_account ON public.accounts;
CREATE TRIGGER trg_prevent_delete_used_account
BEFORE UPDATE OF deleted_at ON public.accounts
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.check_account_usage();

-- 3. معالجة البيانات اليتيمة: ربط أي مستخدم "عالمي" ليس له منظمة بالمنظمة الرئيسية (اختياري حسب سياستك)
-- ملاحظة: اليوزر الخاص بك (Super Admin) يتم استثناؤه برمجياً في React

-- 4. إصلاح تكرار SKU: دالة لتنظيف الرموز المكررة إن وجدت (لضمان استقرار المخزن)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku, organization_id ORDER BY created_at DESC) as rn
    FROM public.products
    WHERE deleted_at IS NULL AND sku IS NOT NULL
)
UPDATE public.products SET sku = sku || '-DUP-' || id::text
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- إزالة القيد القديم إذا وجد لضمان مرونة نظام الـ SaaS
ALTER TABLE public.mfg_batch_serials DROP CONSTRAINT IF EXISTS mfg_batch_serials_serial_number_key;

-- تنظيف القيود القديمة المتعارضة مع نظام السيريال الجديد
ALTER TABLE public.mfg_batch_serials DROP CONSTRAINT IF EXISTS mfg_batch_serials_serial_number_key;

-- إضافة فهرس فريد للسيريالات لضمان عدم تكرارها داخل نفس المنظمة
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_serial_per_org 
ON public.mfg_batch_serials (serial_number, organization_id);

-- تفعيل خيار السيريال آلياً للأصناف التي لها حركات تصنيع (لأغراض التجربة)
UPDATE public.products SET requires_serial = true WHERE id IN (SELECT product_id FROM public.mfg_production_orders);

COMMIT;

SELECT 'تم تطبيق تحديثات الاستقرار بنجاح! النظام الآن أسرع وأكثر أماناً 🚀' as result;