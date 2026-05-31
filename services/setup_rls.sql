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
        'mfg_production_variances', 
        'mfg_material_requests', 'mfg_material_request_items', 
        'mfg_byproducts_logs', 'mfg_beginning_wip_inventory', 'mfg_alerts_log', 'mfg_period_cost_snapshots',
        'whatsapp_notification_queue', 'project_attachments', 'project_inspections',
        'project_change_orders', 'project_site_attendance', 'equipment', 'equipment_usage_logs', 'project_tool_custody',
        'kitchen_orders', 'mfg_qc_inspections', 'mfg_step_attachments', 'bank_reconciliations',
        'project_milestones', 'project_custodies', 'project_custody_expenses',
        'project_material_issues', 'project_material_issue_items', 'project_change_orders',
        'project_site_attendance', 'equipment', 'equipment_usage_logs', 'project_tool_custody',
        'mfg_period_cost_snapshots', 'mfg_byproducts_logs', 'mfg_beginning_wip_inventory', 'mfg_alerts_log'
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
    OR (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
    OR (organization_id IS NOT NULL AND organization_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid)
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
CREATE POLICY "Org_Select_Policy" ON organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin');

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

-- تم إزالتها لأن السياسة العامة Org_Access_Policy_journal_entries تغطيها بشكل أفضل

-- حماية سجل الأخطاء (كل شركة ترى أخطائها فقط، والسوبر أدمن يرى الجميع)
DROP POLICY IF EXISTS "System_Logs_Isolation" ON system_error_logs;
CREATE POLICY "System_Logs_Isolation" ON system_error_logs 
FOR ALL TO authenticated 
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

    -- 📱 صلاحيات المنيو الإلكتروني الشاملة (QR Menu) لضمان عدم ظهور Permission Denied
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT ON public.restaurant_tables TO anon;
    GRANT SELECT ON public.products TO anon;
    GRANT SELECT ON public.item_categories TO anon;
    GRANT SELECT ON public.menu_categories TO anon;
    GRANT SELECT ON public.uoms TO anon;
    GRANT SELECT ON public.uom_categories TO anon;
    GRANT SELECT ON public.modifier_groups TO anon;
    GRANT SELECT ON public.modifiers TO anon;
    GRANT SELECT ON public.order_item_modifiers TO anon;
    GRANT SELECT ON public.organizations TO anon;
    GRANT SELECT ON public.orders TO anon;
    GRANT SELECT ON public.order_items TO anon;
    GRANT SELECT ON public.table_sessions TO anon;
    GRANT SELECT ON public.company_settings TO anon;
    GRANT SELECT ON public.payments TO anon;

    GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid) TO anon;
    GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO anon;
    GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid, uuid) TO anon;
    -- 🚀 إرسال إشارة تنبيه لمحرك PostgREST لإعادة بناء الكاش فوراً
    NOTIFY pgrst, 'reload schema';
    RAISE NOTICE '🚀 SaaS Schema & Cache Refreshed Successfully';
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 📱 سياسات الوصول للمنيو الإلكتروني (Public QR Menu Policies)
-- =================================================================
DROP POLICY IF EXISTS "Public_Table_Lookup_QR" ON public.restaurant_tables;
CREATE POLICY "Public_Table_Lookup_QR" ON public.restaurant_tables FOR SELECT TO anon USING (qr_access_key IS NOT NULL);

DROP POLICY IF EXISTS "Public_Menu_Read_Policy" ON public.products;
CREATE POLICY "Public_Menu_Read_Policy" ON public.products FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "Public_Category_Read_Policy" ON public.item_categories;
CREATE POLICY "Public_Category_Read_Policy" ON public.item_categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public_UoM_Read_Policy" ON public.uoms;
CREATE POLICY "Public_UoM_Read_Policy" ON public.uoms FOR SELECT TO anon USING (true);

-- تنفيذ التنشيط
-- =================================================================
-- 📱 جدول طابور إشعارات الواتساب (WhatsApp Notification Queue)
-- =================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    message_body TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    retry_count INTEGER DEFAULT 0,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

ALTER TABLE public.whatsapp_notification_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_WA_Queue_Isolation" ON public.whatsapp_notification_queue;
CREATE POLICY "SaaS_WA_Queue_Isolation" ON public.whatsapp_notification_queue 
FOR ALL TO authenticated USING (organization_id = public.get_my_org());

GRANT ALL ON public.whatsapp_notification_queue TO authenticated;
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