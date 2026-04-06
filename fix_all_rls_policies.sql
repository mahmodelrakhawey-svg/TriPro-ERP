-- ============================================
-- إصلاح شامل لجميع الجداول المفقودة سياسات RLS
-- ============================================

-- إضافة عمود organization_id إلى menu_categories إذا لم يكن موجوداً
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- إضافة عمود organization_id إلى notifications إذا لم يكن موجوداً (لكن هو موجود بالفعل)

-- حذف جميع السياسات القديمة والجديدة من جميع الجداول
DROP POLICY IF EXISTS "warehouses viewable" ON public.warehouses CASCADE;
DROP POLICY IF EXISTS "warehouses management" ON public.warehouses CASCADE;
DROP POLICY IF EXISTS "warehouses_read" ON public.warehouses CASCADE;
DROP POLICY IF EXISTS "warehouses_write" ON public.warehouses CASCADE;
DROP POLICY IF EXISTS "warehouses_update" ON public.warehouses CASCADE;
DROP POLICY IF EXISTS "warehouses_delete" ON public.warehouses CASCADE;

DROP POLICY IF EXISTS "products viewable" ON public.products CASCADE;
DROP POLICY IF EXISTS "products management" ON public.products CASCADE;
DROP POLICY IF EXISTS "products_read" ON public.products CASCADE;
DROP POLICY IF EXISTS "products_write" ON public.products CASCADE;
DROP POLICY IF EXISTS "products_update" ON public.products CASCADE;
DROP POLICY IF EXISTS "products_delete" ON public.products CASCADE;

DROP POLICY IF EXISTS "customers viewable" ON public.customers CASCADE;
DROP POLICY IF EXISTS "customers management" ON public.customers CASCADE;
DROP POLICY IF EXISTS "customers_read" ON public.customers CASCADE;
DROP POLICY IF EXISTS "customers_write" ON public.customers CASCADE;
DROP POLICY IF EXISTS "customers_update" ON public.customers CASCADE;
DROP POLICY IF EXISTS "customers_delete" ON public.customers CASCADE;

DROP POLICY IF EXISTS "suppliers viewable" ON public.suppliers CASCADE;
DROP POLICY IF EXISTS "suppliers management" ON public.suppliers CASCADE;
DROP POLICY IF EXISTS "suppliers_read" ON public.suppliers CASCADE;
DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers CASCADE;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers CASCADE;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers CASCADE;

DROP POLICY IF EXISTS "employees viewable" ON public.employees CASCADE;
DROP POLICY IF EXISTS "employees management" ON public.employees CASCADE;
DROP POLICY IF EXISTS "employees_read" ON public.employees CASCADE;
DROP POLICY IF EXISTS "employees_write" ON public.employees CASCADE;
DROP POLICY IF EXISTS "employees_update" ON public.employees CASCADE;
DROP POLICY IF EXISTS "employees_delete" ON public.employees CASCADE;

DROP POLICY IF EXISTS "invoices viewable" ON public.invoices CASCADE;
DROP POLICY IF EXISTS "invoices management" ON public.invoices CASCADE;
DROP POLICY IF EXISTS "invoices_read" ON public.invoices CASCADE;
DROP POLICY IF EXISTS "invoices_write" ON public.invoices CASCADE;
DROP POLICY IF EXISTS "invoices_update" ON public.invoices CASCADE;
DROP POLICY IF EXISTS "invoices_delete" ON public.invoices CASCADE;

DROP POLICY IF EXISTS "invoice_items viewable" ON public.invoice_items CASCADE;
DROP POLICY IF EXISTS "invoice_items management" ON public.invoice_items CASCADE;
DROP POLICY IF EXISTS "invoice_items_read" ON public.invoice_items CASCADE;
DROP POLICY IF EXISTS "invoice_items_write" ON public.invoice_items CASCADE;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items CASCADE;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items CASCADE;

DROP POLICY IF EXISTS "purchase_invoices viewable" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "purchase_invoices management" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "purchase_invoices_read" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "purchase_invoices_write" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "purchase_invoices_update" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "purchase_invoices_delete" ON public.purchase_invoices CASCADE;

DROP POLICY IF EXISTS "purchase_invoice_items viewable" ON public.purchase_invoice_items CASCADE;
DROP POLICY IF EXISTS "purchase_invoice_items management" ON public.purchase_invoice_items CASCADE;
DROP POLICY IF EXISTS "purchase_invoice_items_read" ON public.purchase_invoice_items CASCADE;
DROP POLICY IF EXISTS "purchase_invoice_items_write" ON public.purchase_invoice_items CASCADE;
DROP POLICY IF EXISTS "purchase_invoice_items_update" ON public.purchase_invoice_items CASCADE;
DROP POLICY IF EXISTS "purchase_invoice_items_delete" ON public.purchase_invoice_items CASCADE;

DROP POLICY IF EXISTS "journal_entries viewable" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "journal_entries management" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "journal_entries_read" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "journal_entries_write" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "journal_entries_update" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "journal_entries_delete" ON public.journal_entries CASCADE;

DROP POLICY IF EXISTS "journal_lines viewable" ON public.journal_lines CASCADE;
DROP POLICY IF EXISTS "journal_lines management" ON public.journal_lines CASCADE;
DROP POLICY IF EXISTS "journal_lines_read" ON public.journal_lines CASCADE;
DROP POLICY IF EXISTS "journal_lines_write" ON public.journal_lines CASCADE;
DROP POLICY IF EXISTS "journal_lines_update" ON public.journal_lines CASCADE;
DROP POLICY IF EXISTS "journal_lines_delete" ON public.journal_lines CASCADE;

DROP POLICY IF EXISTS "receipt_vouchers viewable" ON public.receipt_vouchers CASCADE;
DROP POLICY IF EXISTS "receipt_vouchers management" ON public.receipt_vouchers CASCADE;
DROP POLICY IF EXISTS "receipt_vouchers_read" ON public.receipt_vouchers CASCADE;
DROP POLICY IF EXISTS "receipt_vouchers_write" ON public.receipt_vouchers CASCADE;
DROP POLICY IF EXISTS "receipt_vouchers_update" ON public.receipt_vouchers CASCADE;
DROP POLICY IF EXISTS "receipt_vouchers_delete" ON public.receipt_vouchers CASCADE;

DROP POLICY IF EXISTS "payment_vouchers viewable" ON public.payment_vouchers CASCADE;
DROP POLICY IF EXISTS "payment_vouchers management" ON public.payment_vouchers CASCADE;
DROP POLICY IF EXISTS "payment_vouchers_read" ON public.payment_vouchers CASCADE;
DROP POLICY IF EXISTS "payment_vouchers_write" ON public.payment_vouchers CASCADE;
DROP POLICY IF EXISTS "payment_vouchers_update" ON public.payment_vouchers CASCADE;
DROP POLICY IF EXISTS "payment_vouchers_delete" ON public.payment_vouchers CASCADE;

DROP POLICY IF EXISTS "cheques viewable" ON public.cheques CASCADE;
DROP POLICY IF EXISTS "cheques management" ON public.cheques CASCADE;
DROP POLICY IF EXISTS "cheques_read" ON public.cheques CASCADE;
DROP POLICY IF EXISTS "cheques_write" ON public.cheques CASCADE;
DROP POLICY IF EXISTS "cheques_update" ON public.cheques CASCADE;
DROP POLICY IF EXISTS "cheques_delete" ON public.cheques CASCADE;

DROP POLICY IF EXISTS "company_settings viewable" ON public.company_settings CASCADE;
DROP POLICY IF EXISTS "company_settings management" ON public.company_settings CASCADE;
DROP POLICY IF EXISTS "company_settings_read" ON public.company_settings CASCADE;
DROP POLICY IF EXISTS "company_settings_write" ON public.company_settings CASCADE;
DROP POLICY IF EXISTS "company_settings_update" ON public.company_settings CASCADE;
DROP POLICY IF EXISTS "company_settings_delete" ON public.company_settings CASCADE;

DROP POLICY IF EXISTS "security_logs viewable" ON public.security_logs CASCADE;
DROP POLICY IF EXISTS "security_logs management" ON public.security_logs CASCADE;
DROP POLICY IF EXISTS "security_logs_read" ON public.security_logs CASCADE;
DROP POLICY IF EXISTS "security_logs_write" ON public.security_logs CASCADE;

-- تفعيل RLS على جميع الجداول
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات بسيطة لجميع الجداول
-- warehouses
CREATE POLICY "warehouses_read" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouses_write" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "warehouses_update" ON public.warehouses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "warehouses_delete" ON public.warehouses FOR DELETE TO authenticated USING (true);

-- products
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_write" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated USING (true);

-- customers
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated USING (true);

-- suppliers
CREATE POLICY "suppliers_read" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated USING (true);

-- employees
CREATE POLICY "employees_read" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees_write" ON public.employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "employees_update" ON public.employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "employees_delete" ON public.employees FOR DELETE TO authenticated USING (true);

-- invoices
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoices_write" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated USING (true);

-- invoice_items
CREATE POLICY "invoice_items_read" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoice_items_write" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "invoice_items_update" ON public.invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoice_items_delete" ON public.invoice_items FOR DELETE TO authenticated USING (true);

-- purchase_invoices
CREATE POLICY "purchase_invoices_read" ON public.purchase_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_invoices_write" ON public.purchase_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_invoices_update" ON public.purchase_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_invoices_delete" ON public.purchase_invoices FOR DELETE TO authenticated USING (true);

-- purchase_invoice_items
CREATE POLICY "purchase_invoice_items_read" ON public.purchase_invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_invoice_items_write" ON public.purchase_invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_invoice_items_update" ON public.purchase_invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_invoice_items_delete" ON public.purchase_invoice_items FOR DELETE TO authenticated USING (true);

-- journal_entries
CREATE POLICY "journal_entries_read" ON public.journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "journal_entries_write" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "journal_entries_update" ON public.journal_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "journal_entries_delete" ON public.journal_entries FOR DELETE TO authenticated USING (true);

-- journal_lines
CREATE POLICY "journal_lines_read" ON public.journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "journal_lines_write" ON public.journal_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "journal_lines_update" ON public.journal_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "journal_lines_delete" ON public.journal_lines FOR DELETE TO authenticated USING (true);

-- receipt_vouchers
CREATE POLICY "receipt_vouchers_read" ON public.receipt_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "receipt_vouchers_write" ON public.receipt_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "receipt_vouchers_update" ON public.receipt_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "receipt_vouchers_delete" ON public.receipt_vouchers FOR DELETE TO authenticated USING (true);

-- payment_vouchers
CREATE POLICY "payment_vouchers_read" ON public.payment_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "payment_vouchers_write" ON public.payment_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payment_vouchers_update" ON public.payment_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payment_vouchers_delete" ON public.payment_vouchers FOR DELETE TO authenticated USING (true);

-- cheques
CREATE POLICY "cheques_read" ON public.cheques FOR SELECT TO authenticated USING (true);
CREATE POLICY "cheques_write" ON public.cheques FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cheques_update" ON public.cheques FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cheques_delete" ON public.cheques FOR DELETE TO authenticated USING (true);

-- company_settings
CREATE POLICY "company_settings_read" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_settings_write" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_settings_update" ON public.company_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "company_settings_delete" ON public.company_settings FOR DELETE TO authenticated USING (true);

-- security_logs
CREATE POLICY "security_logs_read" ON public.security_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "security_logs_write" ON public.security_logs FOR INSERT TO authenticated WITH CHECK (true);

-- التحقق من النتائج
SELECT '✅ تم إصلاح سياسات جميع الجداول!' as النتيجة;

SELECT
    tablename,
    COUNT(*) as عدد_السياسات
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;