-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================

-- حذف الدوال القديمة لضمان التحديث

-- 1. دالة مساعدة للتحقق من دور المستخدم الحالي
-- تعتمد على جدول profiles الذي يحتوي على عمود role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- الوصول السريع للدور من الـ JWT أو من جدول البروفايلات
  RETURN COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role')::text,
    (SELECT role::text FROM public.profiles WHERE id = auth.uid())
  );
END;
$$;

-- 1.1 دالة جلب معرف المنظمة (ضرورية لعزل البيانات ودعم السوبر أدمن)
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid,
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    );
END; $$;

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
-- تم التحديث: السوبر أدمن يرى الجميع، والأدمن العادي يرى مستخدمي شركته فقط
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles 
FOR SELECT TO authenticated 
USING (get_my_role() = 'super_admin' OR organization_id = get_my_org() OR id = auth.uid());

-- يمكن للمستخدم تعديل بياناته فقط
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- إدارة المستخدمين: السوبر أدمن يمتلك صلاحية مطلقة، والأدمن محصور بمنظمته
DROP POLICY IF EXISTS "Admins can manage profiles" ON profiles;
CREATE POLICY "Admins can manage profiles" ON profiles 
FOR ALL TO authenticated 
USING (
    get_my_role() = 'super_admin' 
    OR (get_my_role() = 'admin' AND organization_id = get_my_org())
);

-- 2. إعدادات الشركة (Company Settings)
-- قراءة للجميع (المصادق عليهم)
DROP POLICY IF EXISTS "Settings viewable by authenticated" ON company_settings;
CREATE POLICY "Settings viewable by authenticated" ON company_settings FOR SELECT TO authenticated USING (true);
-- تعديل للمدراء فقط
DROP POLICY IF EXISTS "Only Admins can update settings" ON company_settings;
CREATE POLICY "Only Admins can update settings" ON company_settings FOR UPDATE USING (is_admin());

-- 3. البيانات الأساسية (Products, Customers, Suppliers, Accounts)
-- السوبر أدمن يرى الجميع، والمستخدم يرى بيانات منظمته فقط
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON products;
CREATE POLICY "Basic data viewable by authenticated" ON products FOR SELECT TO authenticated, anon USING (get_my_role() = 'super_admin' OR organization_id = get_my_org() OR auth.role() = 'anon');
DROP POLICY IF EXISTS "Basic data viewable by authenticated_cust" ON customers;
CREATE POLICY "Basic data viewable by authenticated_cust" ON customers FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Basic data viewable by authenticated_supp" ON suppliers;
CREATE POLICY "Basic data viewable by authenticated_supp" ON suppliers FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Basic data viewable by authenticated_acc" ON accounts;
CREATE POLICY "Basic data viewable by authenticated_acc" ON accounts FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());

-- إدارة البيانات الأساسية: السوبر أدمن لديه صلاحية مطلقة، والموظفون محصورون بمنظماتهم
DROP POLICY IF EXISTS "Staff can manage products" ON products;
CREATE POLICY "Staff can manage products" ON products FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'sales', 'purchases', 'accountant')));
DROP POLICY IF EXISTS "Staff can manage customers" ON customers;
CREATE POLICY "Staff can manage customers" ON customers FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'sales', 'accountant')));
DROP POLICY IF EXISTS "Staff can manage suppliers" ON suppliers;
CREATE POLICY "Staff can manage suppliers" ON suppliers FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'purchases', 'accountant')));
DROP POLICY IF EXISTS "Admins/Accountants manage accounts" ON accounts;
CREATE POLICY "Admins/Accountants manage accounts" ON accounts FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'accountant')));

-- 4. العمليات المالية (Invoices, Journals, Vouchers)
-- السوبر أدمن يرى كل العمليات للدعم، والمستخدم يرى عمليات شركته فقط
DROP POLICY IF EXISTS "Financials viewable by authenticated" ON invoices;
CREATE POLICY "Financials viewable by authenticated" ON invoices FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Financials viewable by authenticated_pi" ON purchase_invoices;
CREATE POLICY "Financials viewable by authenticated_pi" ON purchase_invoices FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Financials viewable by authenticated_je" ON journal_entries;
CREATE POLICY "Financials viewable by authenticated_je" ON journal_entries FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());

-- إدارة العمليات (Create/Update) حسب الدور
-- المبيعات
DROP POLICY IF EXISTS "Sales can manage invoices" ON invoices;
CREATE POLICY "Sales can manage invoices" ON invoices FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'sales', 'accountant')));
DROP POLICY IF EXISTS "Sales can manage invoice items" ON invoice_items;
CREATE POLICY "Sales can manage invoice items" ON invoice_items FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'sales', 'accountant')));

-- المشتريات
DROP POLICY IF EXISTS "Purchases can manage POs" ON purchase_invoices;
CREATE POLICY "Purchases can manage POs" ON purchase_invoices FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'purchases', 'accountant')));
DROP POLICY IF EXISTS "Purchases can manage PO items" ON purchase_invoice_items;
CREATE POLICY "Purchases can manage PO items" ON purchase_invoice_items FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'purchases', 'accountant')));

-- المحاسبة (القيود والسندات)
DROP POLICY IF EXISTS "Accountants manage journals" ON journal_entries;
CREATE POLICY "Accountants manage journals" ON journal_entries FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant')));
DROP POLICY IF EXISTS "Accountants manage journal lines" ON journal_lines;
CREATE POLICY "Accountants manage journal lines" ON journal_lines FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant')));
DROP POLICY IF EXISTS "Accountants manage vouchers" ON receipt_vouchers;
CREATE POLICY "Accountants manage vouchers" ON receipt_vouchers FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant', 'sales')));

-- 5. حماية بيانات الموارد البشرية والرواتب (HR & Payroll Security)
-- تمنع هذه السياسة المحاسبين والبائعين من رؤية تفاصيل الرواتب الحساسة
-- إضافة حماية خاصة لجدول الرواتب تمنع السوبر أدمن إلا في حالة الطوارئ الموثقة

-- أولاً: تفعيل RLS للجداول
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

-- ثانياً: سياسة القراءة لجداول الرواتب (الموظف العادي لا يرى شيئاً، المدير يرى شركته، السوبر أدمن يحتاج وضع الطوارئ)
DROP POLICY IF EXISTS "Restricted_Payrolls_Select" ON payrolls;
CREATE POLICY "Restricted_Payrolls_Select" ON payrolls FOR SELECT TO authenticated 
USING (
    (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager')) 
    OR 
    (get_my_role() = 'super_admin' AND current_setting('app.emergency_mode', true) = 'on')
);

DROP POLICY IF EXISTS "Restricted_Payroll_Items_Select" ON payroll_items;
CREATE POLICY "Restricted_Payroll_Items_Select" ON payroll_items FOR SELECT TO authenticated 
USING (
    (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager')) 
    OR 
    (get_my_role() = 'super_admin' AND current_setting('app.emergency_mode', true) = 'on')
);

-- ثالثاً: سياسة الإدارة (تعديل/حذف)
DROP POLICY IF EXISTS "HR_Manage_Payrolls" ON payrolls;
CREATE POLICY "HR_Manage_Payrolls" ON payrolls FOR ALL TO authenticated 
USING (
    (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager'))
    OR
    (get_my_role() = 'super_admin' AND current_setting('app.emergency_mode', true) = 'on')
);

-- 6. سجلات الأمان (Security Logs)
DROP POLICY IF EXISTS "Everyone can insert logs" ON security_logs;
CREATE POLICY "Everyone can insert logs" ON security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);

-- =================================================================
-- تعليمات التنفيذ
-- =================================================================
/*
1. انسخ هذا الكود بالكامل.
2. اذهب إلى لوحة تحكم Supabase -> SQL Editor.
3. الصق الكود واضغط Run.
4. تأكد من عدم وجود أخطاء.
*/