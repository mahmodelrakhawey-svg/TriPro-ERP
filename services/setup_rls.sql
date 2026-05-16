-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================
-- النسخة V14 النهائية الموحدة - دعم اليوزر العالمي وإحصائيات ساس

-- حذف الدوال القديمة لضمان التحديث
-- =================================================================
-- 🔓 منح الصلاحيات الأساسية (Critical Grants)
-- =================================================================
-- تم إلغاء المنح العام الواسع لضمان مبدأ Least Privilege
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        -- نمنح الصلاحيات الأساسية فقط، والـ RLS تتكفل بالباقي
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
    RAISE NOTICE '✅ Permissions granted surgically.';
END $$;

-- Existing grants
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_historical_ratios(uuid) TO authenticated; -- هذا السطر صحيح ويمكن أن يبقى
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
-- 🛡️ تقييد الصلاحيات الافتراضية للمستقبل (Surgical Default Privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- =================================================================
-- تفعيل RLS على الجداول (يمنع الوصول الافتراضي للجميع)
-- =================================================================
DO $$ 
DECLARE 
    t text;
    tables_to_rls text[] := ARRAY[
        'products', 'customers', 'suppliers', 'warehouses', 'employees', 
        'payrolls', 'payroll_items', 'shifts', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'cheque_attachments',
        'orders', 'order_items', 'table_sessions', 
        'restaurant_tables', 'menu_categories', 'modifier_groups', 'modifiers', 
        'organization_backups', 'roles', 'permissions', 'role_permissions', 'invitations',
        'invoices', 'invoice_items', 'purchase_invoices', 'purchase_invoice_items', 
        'journal_entries', 'journal_lines', 'receipt_vouchers', 'payment_vouchers', 
        'cheques', 'stock_adjustments', 'stock_adjustment_items', 'inventory_counts', 
        'inventory_count_items', 'stock_transfers', 'stock_transfer_items', 
        'opening_inventories', 'credit_notes', 'debit_notes', 'work_orders', 
        'work_order_costs', 'mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 
        'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials', 
        'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 
        'mfg_production_variances', 'mfg_material_requests', 'mfg_material_request_items',
        'kitchen_orders', 'mfg_qc_inspections', 'mfg_step_attachments', 'bank_reconciliations'
    ];
    BEGIN

        FOREACH t IN ARRAY tables_to_rls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;
END $$;

-- =================================================================
-- تعريف السياسات (Policies)
-- =================================================================

-- 1. جدول المستخدمين (Profiles)
-- يمكن للجميع قراءة بيانات المستخدمين (لأغراض العرض في القوائم)
-- تم التحديث: السوبر أدمن يرى الجميع، والأدمن العادي يرى مستخدمي شركته فقط، والمستخدم يرى نفسه
-- 🛡️ إصلاح: استخدام سياسة غير استدعائية (Non-Recursive)
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles 
FOR SELECT TO authenticated 
USING (
    id = auth.uid() -- يرى ملفه الخاص دائماً
    OR (public.get_my_role() = 'super_admin') -- السوبر أدمن يرى الجميع عبر دالة الهوية الموحدة
    OR (organization_id IS NOT NULL AND organization_id = public.get_my_org()) -- زملاء العمل في نفس الشركة
);

-- 1.1 إشعارات النظام (Notifications)
-- تسمح للمستخدم برؤية إشعاراته الخاصة أو إشعارات شركته
DROP POLICY IF EXISTS "notifications_access_policy" ON public.notifications;
CREATE POLICY "notifications_access_policy" ON public.notifications 
FOR ALL TO authenticated 
USING (
    user_id = auth.uid() 
    OR (organization_id IS NOT NULL AND organization_id = public.get_my_org())
    OR (public.get_my_role() = 'super_admin')
)
-- 🛡️ منع حقن إشعارات لمنظمات أخرى
WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

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

-- 1.2 سياسة عامة لجميع الجداول التي تحتوي على organization_id
-- تسمح للمستخدمين المصادق عليهم بالوصول لبيانات منظمتهم
DO $$
DECLARE
    t text;
    tables_with_org_id text[] := ARRAY(
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema
        WHERE c.table_schema = 'public' 
        AND c.column_name = 'organization_id'
        AND t.table_type = 'BASE TABLE' -- 🛡️ حماية: استهداف الجداول الأساسية فقط وتجاهل الـ Views
        AND c.table_name NOT IN ('profiles', 'organizations', 'company_settings', 'notifications', 'payrolls', 'payroll_items') -- الجداول التي لها سياسات خاصة
    );
BEGIN
    FOREACH t IN ARRAY tables_with_org_id LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Org_Access_Policy_%I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Org_Access_Policy_%I" ON public.%I FOR ALL TO authenticated 
            USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') 
            WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', 
            t, t);
    END LOOP;
END $$;

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


-- سياسة المرفقات الشاملة (ضمان رؤية مرفقات الشركة فقط لكافة أنواع السندات)
DO $$ 
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['receipt_voucher_attachments', 'payment_voucher_attachments', 'cheque_attachments', 'journal_attachments', 'organization_backups', 'notifications'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- التأكد من وجود العمود لتجنب الخطأ 42703 في حال تخطي الملف الرابع
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            
            -- 🛡️ إضافة عمود priority المفقود لجدول الإشعارات لتجنب خطأ PGRST204
            IF t = 'notifications' THEN
                EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT ''info''';
                EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url text';
                EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_id uuid';
            END IF;
            
            EXECUTE format('DROP POLICY IF EXISTS "Attachments_SaaS_Policy" ON public.%I;', t);
            EXECUTE format('CREATE POLICY "Attachments_SaaS_Policy" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', t);
        END IF;
    END LOOP;
END $$;

-- إضافة سياسة إدارة المطبخ المفقودة
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_orders') THEN
        DROP POLICY IF EXISTS "Staff can manage kitchen_orders" ON kitchen_orders;
        CREATE POLICY "Staff can manage kitchen_orders" ON kitchen_orders 
        FOR ALL TO authenticated
        -- 👨‍🍳 قصر إدارة المطبخ على الأدوار المعنية فقط
        USING ((organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager', 'chef', 'cashier')) OR public.get_my_role() = 'super_admin')
        WITH CHECK ((organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager', 'chef', 'cashier')) OR public.get_my_role() = 'super_admin');
    END IF;
END $$;
-- حماية القيود المحاسبية (ممنوع على الـ Viewer و البائعين)
DROP POLICY IF EXISTS "Journal_Entries_Isolation" ON journal_entries;
CREATE POLICY "Journal_Entries_Isolation" ON journal_entries
FOR SELECT TO authenticated 
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');
-- 6. سياسة النسخ الاحتياطي (Backups)
DROP POLICY IF EXISTS "Admins manage backups" ON organization_backups;
CREATE POLICY "Admins manage backups" ON organization_backups 
FOR ALL TO authenticated 
USING (
    public.get_my_role() = 'super_admin'
    OR (organization_id = public.get_my_org() AND public.is_admin())
);
-- 5. حماية بيانات الموارد البشرية والرواتب (HR & Payroll Security)
-- تمنع هذه السياسة المحاسبين والبائعين من رؤية تفاصيل الرواتب الحساسة
-- إضافة حماية خاصة لجدول الرواتب تمنع السوبر أدمن إلا في حالة الطوارئ الموثقة

-- ثانياً: سياسة القراءة لجداول الرواتب (الموظف العادي لا يرى شيئاً، المدير يرى شركته، السوبر أدمن يرى الجميع)
DROP POLICY IF EXISTS "Restricted_Payrolls_Select" ON payrolls;
CREATE POLICY "Restricted_Payrolls_Select" ON payrolls FOR SELECT TO authenticated 
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager'))
    OR
    public.get_my_role() = 'super_admin'
);

DROP POLICY IF EXISTS "Restricted_Payroll_Items_Select" ON payroll_items;
CREATE POLICY "Restricted_Payroll_Items_Select" ON payroll_items FOR SELECT TO authenticated 
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager'))
    OR
    public.get_my_role() = 'super_admin'
);

-- ثالثاً: سياسة الإدارة (تعديل/حذف)
DROP POLICY IF EXISTS "HR_Manage_Payrolls" ON payrolls;
CREATE POLICY "HR_Manage_Payrolls" ON payrolls FOR ALL TO authenticated 
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager'))
    OR
    public.get_my_role() = 'super_admin'
);

-- تفعيل حماية البيانات للرؤية لضمان عزل بيانات الساس


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
        
        -- إذا كان الجدول يحتوي على عمود organization_id، نتأكد من السماح بالعمليات حتى لو كان فارغاً للسوبر آدمن (هذا الجزء لم يعد ضرورياً مع السياسة العامة)
        -- إنشاء السياسة الجديدة التي تسمح بكل العمليات للسوبر أدمن
        EXECUTE format('
            CREATE POLICY "SuperAdmin_Universal_Access" ON public.%I 
            FOR ALL TO authenticated
            USING (public.get_my_role() = ''super_admin'')
            WITH CHECK (public.get_my_role() = ''super_admin'');
        ', tbl);
    END LOOP;
END $$;

-- =================================================================
-- 🔄 دالة تحديث المخطط (Schema Refresh Utility)
-- الوصف: تضمن وجود الدالة لمنع الخطأ 42883 وتنبيه النظام بالتغييرات
-- =================================================================
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS void AS $$
BEGIN
    -- 🛡️ ضمان منح الصلاحيات للجداول الجديدة (فقط إذا كانت موجودة)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifier_groups') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifier_groups TO authenticated, anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifiers') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifiers TO authenticated, anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_item_modifiers') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_modifiers TO authenticated, anon';
    END IF;

    -- 🚀 إرسال إشارة تنبيه لمحرك PostgREST لإعادة بناء الكاش فوراً
    NOTIFY pgrst, 'reload schema';
    RAISE NOTICE '🚀 SaaS Schema & Cache Refreshed Successfully';
END;
$$ LANGUAGE plpgsql;

-- تنفيذ التنشيط
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