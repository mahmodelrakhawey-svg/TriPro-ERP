-- ملف: services/optimize_database_performance.sql
-- الغرض: إضافة فهارس (Indexes) لتسريع عمليات البحث والتقارير

BEGIN;

-- 1. فهارس للقيود اليومية (الأكثر استخداماً في التقارير المالية)
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(transaction_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON public.journal_entries(reference);

-- 2. فهارس لأسطر القيود (لتسريع دفتر الأستاذ وميزان المراجعة)
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON public.journal_lines(journal_entry_id);

-- 3. فهارس للفواتير (لتسريع سجل الفواتير والتقارير)
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 4. فهارس للمشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON public.purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id ON public.purchase_invoices(supplier_id);

-- 5. فهارس للمنتجات (لتسريع البحث في الفواتير والجرد)
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- 6. فهارس للعملاء والموردين
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

-- 7. فهارس للسندات والشيكات
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_date ON public.receipt_vouchers(receipt_date);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_date ON public.payment_vouchers(payment_date);
CREATE INDEX IF NOT EXISTS idx_cheques_due_date ON public.cheques(due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON public.cheques(status);

-- 8. تحديث إحصائيات قاعدة البيانات لضمان استخدام الفهارس الجديدة
ANALYZE public.journal_entries;
ANALYZE public.journal_lines;
ANALYZE public.invoices;
ANALYZE public.products;

DO $$
BEGIN
    RAISE NOTICE 'تم إنشاء الفهارس وتحسين أداء قاعدة البيانات بنجاح.';
END $$;

COMMIT;