-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- قم بتشغيل هذا الملف في Supabase SQL Editor لضمان توافق قاعدة البيانات مع الكود

BEGIN;

-- 1. توحيد أسماء أعمدة المرتجعات (لتتوافق مع الكود الجديد)
DO $$
BEGIN
    -- جدول بنود مرتجع المبيعات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
        END IF;
    END IF;

    -- جدول بنود مرتجع المشتريات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
        END IF;
    END IF;
END $$;

-- 2. إضافة الأعمدة المفقودة (لضمان عدم حدوث أخطاء عند الحفظ)
-- إعدادات الكسور العشرية
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;

-- ربط الفواتير والشيكات بالقيود المحاسبية
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);

-- ربط المرتجعات بالفواتير الأصلية
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);

-- 3. التأكد من وجود الحسابات المحاسبية الحرجة (لتجنب أخطاء القيود الآلية)
-- أوراق القبض (1204)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active)
SELECT gen_random_uuid(), '1204', 'أوراق القبض (شيكات)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '102' LIMIT 1), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1204') AND EXISTS (SELECT 1 FROM accounts WHERE code = '102');

-- أوراق الدفع (2202)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active)
SELECT gen_random_uuid(), '2202', 'أوراق الدفع', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '2' LIMIT 1), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2202') AND EXISTS (SELECT 1 FROM accounts WHERE code = '2');

-- 4. تنظيف البيانات الفاسدة (اختياري - يحذف التفاصيل التي ليس لها رأس)
-- DELETE FROM public.invoice_items WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
-- DELETE FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);

COMMIT;

-- رسالة تأكيد
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;