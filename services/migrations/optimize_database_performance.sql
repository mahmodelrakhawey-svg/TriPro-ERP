-- ملف: services/migrations/optimize_database_performance.sql
-- الغرض: إضافة فهارس (Indexes) وتحديث الفهارس المركبة لتسريع الاستعلامات وعمليات الفلترة متعددة الشركات (Multi-tenancy)

BEGIN;

-- 1. فهارس القيود اليومية (فهارس منفردة ومركبة لتسريع البحث المحاسبي حسب الشركة والتاريخ)
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON public.journal_entries(organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON public.journal_entries(reference);

-- 2. أسطر القيود (لتسريع دفتر الأستاذ العام وميزان المراجعة)
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_acc ON public.journal_lines(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON public.journal_lines(journal_entry_id);

-- 3. فهارس الفواتير (المبيعات)
CREATE INDEX IF NOT EXISTS idx_invoices_org_date ON public.invoices(organization_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 4. فهارس المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_org_date ON public.purchase_invoices(organization_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id ON public.purchase_invoices(supplier_id);

-- 5. فهارس المنتجات
CREATE INDEX IF NOT EXISTS idx_products_org_name ON public.products(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- 6. فهارس العملاء والموردين
CREATE INDEX IF NOT EXISTS idx_customers_org_name ON public.customers(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_name ON public.suppliers(organization_id, name);

-- 7. فهارس السندات والشيكات
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_org_date ON public.receipt_vouchers(organization_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_org_date ON public.payment_vouchers(organization_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_cheques_due_date ON public.cheques(due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON public.cheques(status);

-- 8. تحديث إحصائيات قاعدة البيانات لضمان استخدام الفهارس الجديدة فورياً
ANALYZE public.journal_entries;
ANALYZE public.journal_lines;
ANALYZE public.invoices;
ANALYZE public.purchase_invoices;
ANALYZE public.products;
ANALYZE public.customers;
ANALYZE public.suppliers;

DO $$
BEGIN
    RAISE NOTICE 'تم إنشاء الفهارس وتحسين أداء قاعدة البيانات بنجاح.';
END $$;

COMMIT;