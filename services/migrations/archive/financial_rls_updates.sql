-- تحديث سياسات RLS للعمليات المالية (القيود والفواتير)
-- لإصلاح مشاكل الصلاحيات في إنشاء القيود والحسابات

-- قراءة للجميع مع عزل المنظمة (لأغراض التقارير والربط)
DROP POLICY IF EXISTS "Financials viewable by authenticated" ON invoices;
CREATE POLICY "Financials viewable by authenticated" ON invoices FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Financials viewable by authenticated_pi" ON purchase_invoices;
CREATE POLICY "Financials viewable by authenticated_pi" ON purchase_invoices FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Financials viewable by authenticated_je" ON journal_entries;
CREATE POLICY "Financials viewable by authenticated_je" ON journal_entries FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

-- إدارة العمليات (Create/Update) حسب الدور والمنظمة
-- المبيعات
DROP POLICY IF EXISTS "Sales can manage invoices" ON invoices;
CREATE POLICY "Sales can manage invoices" ON invoices FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));

DROP POLICY IF EXISTS "Sales can manage invoice items" ON invoice_items;
CREATE POLICY "Sales can manage invoice items" ON invoice_items FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));

-- المشتريات
DROP POLICY IF EXISTS "Purchases can manage POs" ON purchase_invoices;
CREATE POLICY "Purchases can manage POs" ON purchase_invoices FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));

DROP POLICY IF EXISTS "Purchases can manage PO items" ON purchase_invoice_items;
CREATE POLICY "Purchases can manage PO items" ON purchase_invoice_items FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));

-- المحاسبة (القيود والسندات)
DROP POLICY IF EXISTS "Accountants manage journals" ON journal_entries;
CREATE POLICY "Accountants manage journals" ON journal_entries FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'));

DROP POLICY IF EXISTS "Accountants manage journal lines" ON journal_lines;
CREATE POLICY "Accountants manage journal lines" ON journal_lines FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'));

DROP POLICY IF EXISTS "Accountants manage vouchers" ON receipt_vouchers;
CREATE POLICY "Accountants manage vouchers" ON receipt_vouchers FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'sales'));

DROP POLICY IF EXISTS "Accountants manage payments" ON payment_vouchers;
CREATE POLICY "Accountants manage payments" ON payment_vouchers FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'purchases'));

-- إعادة تحميل كاش المخطط
NOTIFY pgrst, 'reload config';