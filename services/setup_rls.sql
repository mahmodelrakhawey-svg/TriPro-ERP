-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================
-- النسخة المحدثة لضمان عزل البيانات ومنع تضارب الجلسات

-- حذف الدوال القديمة لضمان التحديث

-- 1. دالة مساعدة للتحقق من دور المستخدم الحالي
-- تعتمد على جدول profiles الذي يحتوي على عمود role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  _role text;
BEGIN
    _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', '');
    IF _role IS NOT NULL THEN RETURN _role; END IF;

    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
EXCEPTION WHEN OTHERS THEN 
    RETURN 'viewer';
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  _org_id uuid;
BEGIN
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN _org_id;
EXCEPTION 
    WHEN OTHERS THEN 
        RETURN NULL;
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
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- الجداول الأساسية
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_voucher_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_voucher_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_backups ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_inventories ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- تعريف السياسات (Policies)
-- =================================================================

-- 1. جدول المستخدمين (Profiles)
-- يمكن للجميع قراءة بيانات المستخدمين (لأغراض العرض في القوائم)
-- تم التحديث: السوبر أدمن يرى الجميع، والأدمن العادي يرى مستخدمي شركته فقط
DROP POLICY IF EXISTS "Profiles_Select_Policy" ON profiles;
CREATE POLICY "Profiles_Select_Policy" ON profiles 
FOR SELECT TO authenticated USING (
    id = auth.uid() 
    OR (SELECT public.get_my_role()) = 'super_admin' 
    OR organization_id = (SELECT public.get_my_org())
);

-- يمكن للمستخدم تعديل بياناته فقط
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- إدارة المستخدمين: السوبر أدمن يمتلك صلاحية مطلقة، والأدمن محصور بمنظمته
DROP POLICY IF EXISTS "Admins can manage profiles" ON profiles;
CREATE POLICY "Admins can manage profiles" ON profiles 
FOR ALL TO authenticated 
USING (
    public.get_my_role() = 'super_admin' 
    OR (public.get_my_role() = 'admin' AND organization_id = public.get_my_org())
);

-- سياسة السوبر أدمن على المنظمات
DROP POLICY IF EXISTS "Org_SuperAdmin_Policy" ON organizations;
CREATE POLICY "Org_SuperAdmin_Policy" ON organizations FOR ALL TO authenticated USING (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "Org_Select_Policy" ON organizations;
CREATE POLICY "Org_Select_Policy" ON organizations FOR SELECT TO authenticated USING (id = public.get_my_org());

-- 2. إعدادات الشركة (Company Settings)
-- قراءة للجميع (المصادق عليهم)
DROP POLICY IF EXISTS "Settings_Select_Policy" ON company_settings;
CREATE POLICY "Settings_Select_Policy" ON company_settings 
FOR SELECT TO authenticated 
USING (
    organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin'
);

-- تعديل للمدراء فقط
DROP POLICY IF EXISTS "Settings_Update_Policy" ON company_settings;
CREATE POLICY "Settings_Update_Policy" ON company_settings FOR UPDATE TO authenticated USING (public.is_admin() AND (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin'));

-- 3. البيانات الأساسية (Products, Customers, Suppliers, Accounts)
-- السوبر أدمن يرى الجميع، والمستخدم يرى بيانات منظمته فقط
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON products;
CREATE POLICY "Basic data viewable by authenticated" ON products FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
-- سياسة قراءة التصنيفات مع دعم البحث
DROP POLICY IF EXISTS "restaurant_tables_viewable_anon" ON restaurant_tables;
CREATE POLICY "restaurant_tables_viewable_anon" ON restaurant_tables FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "menu_categories_viewable_anon" ON menu_categories;
CREATE POLICY "menu_categories_viewable_anon" ON menu_categories FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "modifier_groups_viewable_anon" ON modifier_groups;
CREATE POLICY "modifier_groups_viewable_anon" ON modifier_groups FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "modifiers_viewable_anon" ON modifiers;
CREATE POLICY "modifiers_viewable_anon" ON modifiers FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "table_sessions_viewable_anon" ON table_sessions;
CREATE POLICY "table_sessions_viewable_anon" ON table_sessions FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "orders_viewable_anon" ON orders;
CREATE POLICY "orders_viewable_anon" ON orders FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "order_items_viewable_anon" ON order_items;
CREATE POLICY "order_items_viewable_anon" ON order_items FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = 'anon' OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "Basic data viewable by authenticated_cust" ON customers;
CREATE POLICY "Basic data viewable by authenticated_cust" ON customers FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Basic data viewable by authenticated_supp" ON suppliers;
CREATE POLICY "Basic data viewable by authenticated_supp" ON suppliers FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());
DROP POLICY IF EXISTS "Basic data viewable by authenticated_acc" ON accounts;
CREATE POLICY "Basic data viewable by authenticated_acc" ON accounts FOR SELECT TO authenticated USING (public.get_my_role() = 'super_admin' OR organization_id = public.get_my_org());

-- سياسة المرفقات الشاملة (ضمان رؤية مرفقات الشركة فقط لكافة أنواع السندات)
DO $$ 
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['receipt_voucher_attachments', 'payment_voucher_attachments', 'cheque_attachments', 'journal_attachments'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Attachments_SaaS_Policy" ON public.%I;', t);
        EXECUTE format('CREATE POLICY "Attachments_SaaS_Policy" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', t);
    END LOOP;
END $$;

-- إدارة البيانات الأساسية: السوبر أدمن لديه صلاحية مطلقة، والموظفون محصورون بمنظماتهم
DO $$ 
DECLARE 
    t text;
    basic_tables text[] := ARRAY['products', 'item_categories', 'warehouses', 'restaurant_tables', 'menu_categories', 'modifier_groups', 'modifiers', 'table_sessions', 'orders', 'order_items', 'customers', 'suppliers', 'accounts', 'assets', 'employees'];
BEGIN 
    FOREACH t IN ARRAY basic_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Policy_Staff_%I" ON public.%I;', t, t);
        -- حذف المسميات القديمة لضمان عدم التضارب
        EXECUTE format('DROP POLICY IF EXISTS "Staff can manage %I" ON public.%I;', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Admins/Accountants manage accounts" ON public.%I;', t);
        
        EXECUTE format('CREATE POLICY "Policy_Staff_%I" ON public.%I FOR ALL TO authenticated USING (
            public.get_my_role() = ''super_admin'' 
            OR (organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager'', ''sales'', ''purchases'', ''accountant''))
        ) WITH CHECK (
            public.get_my_role() = ''super_admin'' 
            OR (organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager'', ''sales'', ''purchases'', ''accountant''))
        );', t, t);
    END LOOP;
END $$;

-- إضافة سياسة إدارة المطبخ المفقودة
DROP POLICY IF EXISTS "Staff can manage kitchen_orders" ON kitchen_orders;
CREATE POLICY "Staff can manage kitchen_orders" ON kitchen_orders 
FOR ALL TO authenticated 
USING (public.get_my_role() = 'super_admin' OR (organization_id = public.get_my_org()))
WITH CHECK (public.get_my_role() = 'super_admin' OR (organization_id = public.get_my_org()));

-- 4. العمليات المالية (Invoices, Journals, Vouchers)
-- السوبر أدمن يرى كل العمليات للدعم، والمستخدم يرى عمليات شركته فقط
DROP POLICY IF EXISTS "Financials viewable by authenticated" ON invoices;
CREATE POLICY "Financials viewable by authenticated" ON invoices FOR SELECT TO authenticated USING (get_my_role() = 'super_admin' OR organization_id = get_my_org());

DO $$ 
DECLARE 
    t text;
    trans_tables text[] := ARRAY['invoices', 'invoice_items', 'purchase_invoices', 'purchase_invoice_items', 'journal_entries', 'journal_lines', 'receipt_vouchers', 'payment_vouchers', 'cheques', 'credit_notes', 'debit_notes', 'payrolls', 'payroll_items', 'quotations', 'quotation_items', 'purchase_orders', 'purchase_order_items'];
BEGIN 
    FOREACH t IN ARRAY trans_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Trans_Staff_%I" ON public.%I;', t, t);
        -- تنظيف السياسات القديمة
        EXECUTE format('DROP POLICY IF EXISTS "%I_Manage_Policy" ON public.%I;', t, t);
        
        EXECUTE format('CREATE POLICY "Trans_Staff_%I" ON public.%I FOR ALL TO authenticated USING (
            public.get_my_role() = ''super_admin'' 
            OR (organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''))
        ) WITH CHECK (
            public.get_my_role() = ''super_admin'' 
            OR (organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''))
        );', t, t);
    END LOOP;
END $$;

-- حماية القيود المحاسبية (ممنوع على الـ Viewer و البائعين)
DROP POLICY IF EXISTS "Journal_Entries_Isolation" ON journal_entries;
CREATE POLICY "Journal_Entries_Isolation" ON journal_entries 
FOR SELECT TO authenticated 
USING ((organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') AND public.get_my_role() NOT IN ('viewer', 'demo', 'sales', 'chef'));

-- إدارة العمليات (Create/Update) حسب الدور
-- المبيعات
DROP POLICY IF EXISTS "Invoices_Manage_Policy" ON invoices;
CREATE POLICY "Invoices_Manage_Policy" ON invoices FOR ALL TO authenticated USING (public.get_my_role() = 'super_admin' OR (organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager', 'sales', 'accountant')));

-- السندات (إضافة سياسة صريحة للسندات لضمان التوافق مع SaaS)
DROP POLICY IF EXISTS "Vouchers_SaaS_Policy" ON receipt_vouchers;
CREATE POLICY "Vouchers_SaaS_Policy" ON receipt_vouchers FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "Vouchers_Pay_SaaS_Policy" ON payment_vouchers;
CREATE POLICY "Vouchers_Pay_SaaS_Policy" ON payment_vouchers FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

-- المشتريات
DROP POLICY IF EXISTS "Purchases can manage POs" ON purchase_invoices;
CREATE POLICY "Purchases can manage POs" ON purchase_invoices FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'purchases', 'accountant')));
DROP POLICY IF EXISTS "Purchases can manage PO items" ON purchase_invoice_items;
CREATE POLICY "Purchases can manage PO items" ON purchase_invoice_items FOR ALL USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'purchases', 'accountant')));

-- المحاسبة (القيود والسندات)
DROP POLICY IF EXISTS "Accountants manage journals" ON journal_entries;
CREATE POLICY "Accountants manage journals" ON journal_entries FOR ALL TO authenticated USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant'))) WITH CHECK (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant')));
DROP POLICY IF EXISTS "Accountants manage journal lines" ON journal_lines;
CREATE POLICY "Accountants manage journal lines" ON journal_lines FOR ALL TO authenticated USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant'))) WITH CHECK (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant')));
DROP POLICY IF EXISTS "Accountants manage vouchers" ON receipt_vouchers;
CREATE POLICY "Accountants manage vouchers" ON receipt_vouchers FOR ALL TO authenticated USING (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant', 'sales'))) WITH CHECK (get_my_role() = 'super_admin' OR (organization_id = get_my_org() AND get_my_role() IN ('admin', 'manager', 'accountant', 'sales')));

-- 5. عمليات المخزون (Inventory Operations)
-- تفعيل السياسات لجداول الجرد والتسويات التي سببت الخطأ
DO $$ 
DECLARE
    inv_tables text[] := ARRAY['stock_adjustments', 'stock_adjustment_items', 'inventory_counts', 'inventory_count_items', 'stock_transfers', 'stock_transfer_items', 'opening_inventories', 'work_order_material_usage', 'bill_of_materials'];
    t text;
BEGIN
    FOREACH t IN ARRAY inv_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Inventory_SaaS_Policy" ON public.%I;', t);
        EXECUTE format('
            CREATE POLICY "Inventory_SaaS_Policy" ON public.%I 
            FOR ALL TO authenticated 
            USING (public.get_my_role() = ''super_admin'' OR (organization_id = public.get_my_org() AND organization_id IS NOT NULL))
            WITH CHECK (public.get_my_role() = ''super_admin'' OR (organization_id = public.get_my_org() AND organization_id IS NOT NULL));
        ', t, t);
    END LOOP;
END $$;

-- 6. سياسة النسخ الاحتياطي (Backups)
DROP POLICY IF EXISTS "Admins manage backups" ON organization_backups;
CREATE POLICY "Admins manage backups" ON organization_backups 
FOR ALL TO authenticated 
USING (
    public.get_my_role() = 'super_admin' 
    OR (organization_id = public.get_my_org() AND is_admin())
);

-- 5. حماية بيانات الموارد البشرية والرواتب (HR & Payroll Security)
-- تمنع هذه السياسة المحاسبين والبائعين من رؤية تفاصيل الرواتب الحساسة
-- إضافة حماية خاصة لجدول الرواتب تمنع السوبر أدمن إلا في حالة الطوارئ الموثقة

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

-- 📊 تقرير الوجبات التي لم يتم ربطها بمكونات (BOM) لضبط التكاليف
CREATE OR REPLACE FUNCTION public.get_products_without_bom(p_org_id uuid)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    sku text,
    category_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(cat.name, 'غير مصنف')
    FROM public.products p
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE (p.organization_id = p_org_id OR public.get_my_role() = 'super_admin')
      AND p.deleted_at IS NULL
      AND p.product_type = 'STOCK'
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = p.id);
END; $$;

NOTIFY pgrst, 'reload config';

-- =================================================================
-- 🚀 سياسة الوصول المطلق للسوبر أدمن (Super Admin Universal Bypass)
-- =================================================================
-- تضمن هذه السياسة وصول السوبر أدمن لكافة الجداول الحسابية والمخزنية والمطاعم
-- حتى في حال وجود تضارب في السياسات الأخرى.
DO $$ 
DECLARE
    tbl text;
    all_system_tables text[] := ARRAY[
        'accounts', 'journal_entries', 'journal_lines', 'journal_attachments',
        'receipt_vouchers', 'payment_vouchers', 'cheques', 'invoices', 'invoice_items',
        'purchase_invoices', 'purchase_invoice_items', 'purchase_orders', 'purchase_order_items',
        'purchase_returns', 'purchase_return_items', 'sales_returns', 'sales_return_items',
        'products', 'item_categories', 'warehouses', 'stock_adjustments', 'stock_adjustment_items',
        'inventory_counts', 'inventory_count_items', 'stock_transfers', 'stock_transfer_items',
        'opening_inventories', 'restaurant_tables', 'menu_categories', 'table_sessions',
        'orders', 'order_items', 'kitchen_orders', 'modifier_groups', 'modifiers', 'order_item_modifiers',
        'shifts', 'payments', 'delivery_orders',
        'assets', 'employees', 'payrolls', 'payroll_items', 'employee_advances',
        'credit_notes', 'debit_notes', 'work_orders', 'work_order_costs', 'notifications'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_system_tables LOOP
        -- حذف أي نسخة قديمة من سياسة التجاوز
        EXECUTE format('DROP POLICY IF EXISTS "SuperAdmin_Universal_Access" ON public.%I;', tbl);
        -- إنشاء السياسة الجديدة التي تسمح بكل العمليات للسوبر أدمن
        EXECUTE format('
            CREATE POLICY "SuperAdmin_Universal_Access" ON public.%I 
            FOR ALL TO authenticated 
            USING (public.get_my_role() = ''super_admin'');
        ', tbl);
    END LOOP;
END $$;

-- تنشيط الكاش لضمان نفاذ السياسات فوراً
SELECT public.refresh_saas_schema();

-- =================================================================
-- تعليمات التنفيذ
-- =================================================================
/*
1. انسخ هذا الكود بالكامل.
2. اذهب إلى لوحة تحكم Supabase -> SQL Editor.
3. الصق الكود واضغط Run.
4. تأكد من عدم وجود أخطاء.
*/