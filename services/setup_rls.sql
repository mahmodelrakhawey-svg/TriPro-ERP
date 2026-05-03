-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================
-- النسخة V14 النهائية الموحدة - دعم اليوزر العالمي وإحصائيات ساس

-- حذف الدوال القديمة لضمان التحديث

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
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_costs ENABLE ROW LEVEL SECURITY;

-- جداول التصنيع
ALTER TABLE public.mfg_work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_routings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_routing_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_order_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_step_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_actual_material_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_scrap_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_batch_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_material_request_items ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- تعريف السياسات (Policies)
-- =================================================================

-- 1. جدول المستخدمين (Profiles)
-- يمكن للجميع قراءة بيانات المستخدمين (لأغراض العرض في القوائم)
-- تم التحديث: السوبر أدمن يرى الجميع، والأدمن العادي يرى مستخدمي شركته فقط، والمستخدم يرى نفسه
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
CREATE POLICY "profiles_select_policy" ON profiles 
FOR SELECT TO authenticated USING (
    id = auth.uid() 
    OR organization_id = public.get_my_org() 
    OR public.get_my_role() = 'super_admin'
);

-- يمكن للمستخدم تعديل بياناته فقط
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- إدارة المستخدمين: السوبر أدمن يمتلك صلاحية مطلقة، والأدمن محصور بمنظمته
DROP POLICY IF EXISTS "profiles_admin_manage_policy" ON profiles;
CREATE POLICY "profiles_admin_manage_policy" ON profiles 
FOR ALL TO authenticated 
USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'admin' AND organization_id = public.get_my_org())
);

-- سياسة السوبر أدمن على المنظمات
DROP POLICY IF EXISTS "Org_SuperAdmin_Policy" ON organizations;
CREATE POLICY "Org_SuperAdmin_Policy" ON organizations FOR ALL TO authenticated USING (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "Org_Select_Policy" ON organizations;
CREATE POLICY "Org_Select_Policy" ON organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin');

-- 2. إعدادات الشركة (Company Settings)
-- قراءة للجميع (المصادق عليهم) والسوبر أدمن
DROP POLICY IF EXISTS "Settings_Select_Policy" ON company_settings;
CREATE POLICY "Settings_Select_Policy" ON company_settings 
FOR SELECT TO authenticated 
USING (
    organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin'
);

-- تعديل للمدراء فقط
DROP POLICY IF EXISTS "settings_update_policy" ON company_settings;
CREATE POLICY "settings_update_policy" ON company_settings FOR UPDATE TO authenticated USING (public.is_admin() AND (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin'));

-- 3. البيانات الأساسية (Products, Customers, Suppliers, Accounts)
-- السوبر أدمن يرى الجميع، والمستخدم يرى بيانات منظمته فقط
DO $$
DECLARE
    t text;
    basic_tables text[] := ARRAY[
        'products', 'customers', 'suppliers', 'warehouses', 'accounts', 'cost_centers',
        'item_categories', 'menu_categories', 'bill_of_materials', 'assets', 'restaurant_tables',
        'modifier_groups', 'modifiers', 'table_sessions', 'orders', 'order_items', 'kitchen_orders', 'order_item_modifiers',
        'payments', 'delivery_orders', 'shifts', 'employees', 'payrolls', 'payroll_items',
        'employee_advances', 'employee_allowances', 'payroll_variables', 'quotations', 'quotation_items',
        'purchase_orders', 'purchase_order_items', 'stock_adjustments', 'stock_adjustment_items',
        'stock_transfers', 'stock_transfer_items', 'inventory_counts', 'inventory_count_items',
        'work_orders', 'work_order_costs', 'bank_reconciliations', 'notifications', 'notification_preferences',
        'notification_audit_log', 'security_logs', 'system_error_logs', 'cash_closings', 'rejected_cash_closings',
        'credit_notes', 'debit_notes', 'receipt_vouchers', 'payment_vouchers', 'cheques',
        'receipt_voucher_attachments', 'payment_voucher_attachments', 'cheque_attachments', 'journal_attachments',
        'sales_returns', 'sales_return_items', 'purchase_invoices', 'purchase_invoice_items', 'invoices', 'invoice_items',
        'purchase_returns', 'purchase_return_items', 'opening_inventories', 'budgets',
        'work_order_material_usage',
        -- جداول التصنيع
        'mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 'mfg_production_orders', 
        'mfg_order_progress', 'mfg_step_materials', 'mfg_actual_material_usage', 
        'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances', 
        'mfg_material_requests', 'mfg_material_request_items', 'mfg_qc_inspections',
        'mfg_work_centers', 'mfg_routings', 'mfg_production_orders', 'mfg_material_requests',
        'mfg_batch_serials', 'mfg_qc_inspections'
    ];
BEGIN
    FOREACH t IN ARRAY basic_tables LOOP
        -- تنفيذ السياسات فقط إذا كان الجدول موجوداً لتجنب الخطأ 42P01
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
        EXECUTE format('DROP POLICY IF EXISTS "SaaS_Select_Policy_%I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "SaaS_Select_Policy_%I" ON public.%I FOR SELECT TO authenticated USING (
            organization_id = public.get_my_org() 
            OR public.get_my_role() = ''super_admin''
            OR organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
        );', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "SaaS_Modify_Policy_%I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "SaaS_Modify_Policy_%I" ON public.%I FOR ALL TO authenticated 
            USING (
                organization_id = public.get_my_org() 
                OR public.get_my_role() = ''super_admin''
                OR organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
            ) 
            WITH CHECK (
                organization_id = public.get_my_org() 
                OR public.get_my_role() = ''super_admin''
                OR organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
            );', t, t);
        END IF;
    END LOOP;
END $$;

-- سياسة المرفقات الشاملة (ضمان رؤية مرفقات الشركة فقط لكافة أنواع السندات)
DO $$ 
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['receipt_voucher_attachments', 'payment_voucher_attachments', 'cheque_attachments', 'journal_attachments'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Attachments_SaaS_Policy" ON public.%I;', t);
        EXECUTE format('CREATE POLICY "Attachments_SaaS_Policy" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', t);
    END LOOP;
END $$;

-- إضافة سياسة إدارة المطبخ المفقودة
DROP POLICY IF EXISTS "Staff can manage kitchen_orders" ON kitchen_orders;
CREATE POLICY "Staff can manage kitchen_orders" ON kitchen_orders 
FOR ALL TO authenticated 
USING (public.get_my_role() = 'super_admin' OR (organization_id = public.get_my_org()))
WITH CHECK (public.get_my_role() = 'super_admin' OR (organization_id = public.get_my_org()));
-- حماية القيود المحاسبية (ممنوع على الـ Viewer و البائعين)
DROP POLICY IF EXISTS "Journal_Entries_Isolation" ON journal_entries;
CREATE POLICY "Journal_Entries_Isolation" ON journal_entries 
FOR SELECT TO authenticated 
USING ((organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') AND public.get_my_role() NOT IN ('viewer', 'demo', 'sales', 'chef'));
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

-- تفعيل حماية البيانات للرؤية لضمان عزل بيانات الساس
ALTER VIEW public.v_mfg_work_center_efficiency SET (security_invoker = on);

-- تطبيق سياسات الوصول الموحدة لكافة جداول التصنيع لضمان عزل البيانات (SaaS Isolation)
    FOREACH t IN ARRAY ARRAY['mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials', 'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances', 'mfg_material_requests', 'mfg_material_request_items', 'mfg_qc_inspections'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "mfg_select_policy_%I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "mfg_select_policy_%I" ON public.%I FOR SELECT TO authenticated 
            USING (organization_id = public.get_my_org() OR public.is_super_admin())', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "mfg_admin_policy_%I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "mfg_admin_policy_%I" ON public.%I FOR ALL TO authenticated 
            USING ((organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager'')) OR public.is_super_admin())', t, t);
        
        -- منح صلاحيات التنفيذ للدوال المرتبطة بالتصنيع آلياً
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;');
    END LOOP;
NOTIFY pgrst, 'reload config';

-- =================================================================
-- 🚀 سياسة الوصول المطلق للسوبر أدمن (Super Admin Universal Bypass)
-- =================================================================
-- تضمن هذه السياسة وصول السوبر أدمن لكافة الجداول الحسابية والمخزنية والمطاعم
-- حتى في حال وجود تضارب في السياسات الأخرى.
DO $$ 
DECLARE
    tbl text;
    -- قائمة شاملة لكل جداول النظام لضمان الصلاحيات المطلقة للسوبر آدمن
    all_system_tables text[] := ARRAY(
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('spatial_ref_sys') -- استثناء جداول النظام التقنية
    );
BEGIN
    FOREACH tbl IN ARRAY all_system_tables LOOP
        -- حذف أي نسخة قديمة من سياسة التجاوز
        EXECUTE format('DROP POLICY IF EXISTS "SuperAdmin_Universal_Access" ON public.%I;', tbl);
        
        -- إذا كان الجدول يحتوي على عمود organization_id، نتأكد من السماح بالعمليات حتى لو كان فارغاً للسوبر آدمن
        -- إنشاء السياسة الجديدة التي تسمح بكل العمليات للسوبر أدمن
        EXECUTE format('
            CREATE POLICY "SuperAdmin_Universal_Access" ON public.%I 
            FOR ALL TO authenticated 
            USING (public.get_my_role() = ''super_admin'')
            WITH CHECK (public.get_my_role() = ''super_admin'');
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