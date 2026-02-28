-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================

-- حذف الدوال القديمة لضمان التحديث

-- 1. دالة مساعدة للتحقق من دور المستخدم الحالي
-- تعتمد على جدول profiles الذي يحتوي على عمود role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text 
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT role::text FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- 2. دالة للتحقق مما إذا كان المستخدم مسؤولاً (Admin/Super Admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean 
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN (get_my_role() IN ('super_admin', 'admin'));
END;
$$;

-- =================================================================
-- تفعيل RLS على الجداول (يمنع الوصول الافتراضي للجميع)
-- =================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- الجداول الأساسية
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- جداول العمليات
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- تعريف السياسات (Policies)
-- =================================================================

-- 1. جدول المستخدمين (Profiles)
-- يمكن للجميع قراءة بيانات المستخدمين (لأغراض العرض في القوائم)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
-- يمكن للمستخدم تعديل بياناته فقط
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
-- يمكن للمدراء فقط إنشاء أو حذف مستخدمين
DROP POLICY IF EXISTS "Admins can manage profiles" ON profiles;
CREATE POLICY "Admins can manage profiles" ON profiles FOR ALL USING (is_admin());

-- 2. إعدادات الشركة (Company Settings)
-- قراءة للجميع (المصادق عليهم)
DROP POLICY IF EXISTS "Settings viewable by authenticated" ON company_settings;
CREATE POLICY "Settings viewable by authenticated" ON company_settings FOR SELECT TO authenticated USING (true);
-- تعديل للمدراء فقط
DROP POLICY IF EXISTS "Only Admins can update settings" ON company_settings;
CREATE POLICY "Only Admins can update settings" ON company_settings FOR UPDATE USING (is_admin());

-- 3. البيانات الأساسية (Products, Customers, Suppliers, Accounts)
-- قراءة للجميع
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON products;
CREATE POLICY "Basic data viewable by authenticated" ON products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Basic data viewable by authenticated_cust" ON customers;
CREATE POLICY "Basic data viewable by authenticated_cust" ON customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Basic data viewable by authenticated_supp" ON suppliers;
CREATE POLICY "Basic data viewable by authenticated_supp" ON suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Basic data viewable by authenticated_acc" ON accounts;
CREATE POLICY "Basic data viewable by authenticated_acc" ON accounts FOR SELECT TO authenticated USING (true);

-- تعديل/إضافة/حذف للموظفين المصرح لهم (ليس Viewer)
DROP POLICY IF EXISTS "Staff can manage products" ON products;
CREATE POLICY "Staff can manage products" ON products FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'purchases', 'accountant'));
DROP POLICY IF EXISTS "Staff can manage customers" ON customers;
CREATE POLICY "Staff can manage customers" ON customers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));
DROP POLICY IF EXISTS "Staff can manage suppliers" ON suppliers;
CREATE POLICY "Staff can manage suppliers" ON suppliers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));
DROP POLICY IF EXISTS "Admins/Accountants manage accounts" ON accounts;
CREATE POLICY "Admins/Accountants manage accounts" ON accounts FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'accountant'));

-- 4. العمليات المالية (Invoices, Journals, Vouchers)
-- قراءة للجميع (لأغراض التقارير والربط)
DROP POLICY IF EXISTS "Financials viewable by authenticated" ON invoices;
CREATE POLICY "Financials viewable by authenticated" ON invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Financials viewable by authenticated_pi" ON purchase_invoices;
CREATE POLICY "Financials viewable by authenticated_pi" ON purchase_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Financials viewable by authenticated_je" ON journal_entries;
CREATE POLICY "Financials viewable by authenticated_je" ON journal_entries FOR SELECT TO authenticated USING (true);

-- إدارة العمليات (Create/Update) حسب الدور
-- المبيعات
DROP POLICY IF EXISTS "Sales can manage invoices" ON invoices;
CREATE POLICY "Sales can manage invoices" ON invoices FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));
DROP POLICY IF EXISTS "Sales can manage invoice items" ON invoice_items;
CREATE POLICY "Sales can manage invoice items" ON invoice_items FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));

-- المشتريات
DROP POLICY IF EXISTS "Purchases can manage POs" ON purchase_invoices;
CREATE POLICY "Purchases can manage POs" ON purchase_invoices FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));
DROP POLICY IF EXISTS "Purchases can manage PO items" ON purchase_invoice_items;
CREATE POLICY "Purchases can manage PO items" ON purchase_invoice_items FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));

-- المحاسبة (القيود والسندات)
DROP POLICY IF EXISTS "Accountants manage journals" ON journal_entries;
CREATE POLICY "Accountants manage journals" ON journal_entries FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'));
DROP POLICY IF EXISTS "Accountants manage journal lines" ON journal_lines;
CREATE POLICY "Accountants manage journal lines" ON journal_lines FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'));
DROP POLICY IF EXISTS "Accountants manage vouchers" ON receipt_vouchers;
CREATE POLICY "Accountants manage vouchers" ON receipt_vouchers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'sales')); -- Sales can create receipts
DROP POLICY IF EXISTS "Accountants manage payments" ON payment_vouchers;
CREATE POLICY "Accountants manage payments" ON payment_vouchers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'purchases')); -- Purchases can create payments

-- 5. سجلات الأمان (Security Logs)
-- يمكن للجميع الإدراج (لتسجيل نشاطهم)
DROP POLICY IF EXISTS "Everyone can insert logs" ON security_logs;
CREATE POLICY "Everyone can insert logs" ON security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);
-- يمكن للمدراء فقط القراءة
DROP POLICY IF EXISTS "Admins view logs" ON security_logs;
CREATE POLICY "Admins view logs" ON security_logs FOR SELECT USING (is_admin());

-- =================================================================
-- تعليمات التنفيذ
-- =================================================================
/*
1. انسخ هذا الكود بالكامل.
2. اذهب إلى لوحة تحكم Supabase -> SQL Editor.
3. الصق الكود واضغط Run.
4. تأكد من عدم وجود أخطاء.
*/