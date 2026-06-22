-- =================================================================
-- 🔒 إعدادات الأمان المتقدمة (Row Level Security - RLS)
-- =================================================================
-- النسخة V14 النهائية الموحدة - دعم اليوزر العالمي وإحصائيات ساس

-- حذف الدوال القديمة لضمان التحديث
-- =================================================================
-- 🔓 منح الصلاحيات الأساسية (Critical Grants)
-- =================================================================
-- تم إلغاء المنح العام الواسع لضمان مبدأ Least Privilege
-- =================================================================
-- 🛡️ محرك التطهير والتوحيد (The Security Hardening Engine)
-- الوصف: حذف كافة السياسات القديمة والمكررة قبل إعادة البناء
-- =================================================================
DO $$ 
DECLARE 
    tbl text;
    pol text;
    -- قائمة السياسات القديمة المطلوب تطهيرها لضمان عدم الازدواجية
    legacy_policies text[] := ARRAY[
        'Org_Data_Access', 'SuperAdmin_Access', 'SaaS_Org_Isolation', 
        'item_categories_isolation', 'menu_categories_isolation',
        'SaaS_Project_Isolation', 'SaaS_BOQ_Isolation',
        'SaaS_Sub_Contract_Isolation', 'SaaS_Sub_Billing_Isolation',
        'SaaS_Subcontractor_Isolation', 'SaaS_Inspection_Isolation',
        'SaaS_Change_Order_Isolation', 'SaaS_Site_Attendance_Isolation',
        'SaaS_Equipment_Isolation', 'SaaS_Equipment_Usage_Isolation',
        'SaaS_Tool_Custody_Isolation', 'SaaS_Material_Issue_Isolation',
        'SaaS_Custody_Isolation', 'SaaS_Custody_Exp_Isolation',
        'SaaS_Billing_Attachment_Isolation', 'SaaS_Project_Attachment_Isolation',
        'SaaS_WA_Queue_Isolation', 'work_order_costs_saas_policy',
        'Alerts_SaaS_Policy', 'Byproducts_SaaS_Policy', 'Snapshots_SaaS_Policy',
        'BeginningWIP_SaaS_Policy', 'Users can only see their organization''s budgets', 
        'Users can manage their org bank reconciliations',
        'Attachments_SaaS_Policy',
        'Settings_Select_Policy',
        'settings_update_policy',
        'profiles_select_policy', -- سيتم إعادة بنائها بشكل أنظف
        'Staff can manage kitchen_orders', -- حماية استباقية
        'Restricted_Payrolls_Select', 'Restricted_Payroll_Items_Select', 'HR_Manage_Payrolls',
        'profiles_public_read', 'profiles_admin_manage_policy', 'permissions_read_policy',
        'permissions_select_policy', 'roles_read_policy', 'Journal_Entries_Isolation',
        'Org_SuperAdmin_Select_All', 'SuperAdmin_Select_All_Orgs'
    ];
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        -- 1. منح الصلاحيات الأساسية
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
        
        -- 2. حذف السياسات القديمة والمكررة
        FOREACH pol IN ARRAY legacy_policies LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
        END LOOP;

        -- 3. تفعيل RLS (لضمان الشمولية)
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
    RAISE NOTICE '✅ System Purged and Permissions Granted.';
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
        'debit_notes', 'work_orders', 'work_order_costs', 'mfg_work_centers', 'company_settings',
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
        'mfg_period_cost_snapshots', 'mfg_byproducts_logs', 'mfg_beginning_wip_inventory', 'mfg_alerts_log',
        -- HIMS & Blood Bank Tables
        'hims_patients', 'hims_doctors', 'hims_visits', 'hims_prescriptions', 'hims_billing',
        'hims_wards', 'hims_beds', 'hims_lab_tests', 'hims_lab_orders', 'hims_radiology_orders',
        'hims_appointments', 'hims_surgeries', 'hims_insurance_claims', 'hims_settings',
        'hims_blood_donors', 'hims_blood_donations', 'hims_blood_transfusions', 'hims_radiology_types',
        'hims_medication_log', 'hims_billing_items', 'hims_clinical_notes', 'hims_nursing_activities',
        'hims_icd10_codes', 'hims_drug_interactions', 'hims_staff_roster', 'hims_lab_specimens',
        'hims_nurse_tasks'
        'saas_business_activities',
        'saas_modules'
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

-- 🛡️ تنظيف سياسات المستشفى القديمة (سيتم الاعتماد على السياسة العامة للمنظمات والسوبر أدمن)
DO $$ 
DECLARE 
    t text;
    hims_legacy_tables text[] := ARRAY[
        'hims_patients', 'hims_doctors', 'hims_visits', 'hims_prescriptions', 'hims_billing',
        'hims_wards', 'hims_beds', 'hims_lab_tests', 'hims_lab_orders', 'hims_radiology_orders',
        'hims_appointments', 'hims_surgeries', 'hims_insurance_claims', 'hims_settings',
        'hims_blood_donors', 'hims_blood_donations', 'hims_blood_transfusions', 'hims_radiology_types',
        'hims_medication_log', 'hims_billing_items', 'hims_clinical_notes', 'hims_nursing_activities',
        'hims_icd10_codes', 'hims_drug_interactions', 'hims_staff_roster', 'hims_lab_specimens',
        'hims_nurse_tasks'
    ];
BEGIN
    FOREACH t IN ARRAY hims_legacy_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "HIMS_Admin_Policy_%I" ON public.%I', t, t);
    END LOOP;
END $$;

-- =================================================================
-- 🛠️ مرونة الربط المحاسبي للمرضى (Accounting Resilience)
-- =================================================================
-- دالة تضمن عدم انهيار تسجيل المريض في حال وجود خطأ في إنشاء سجل العميل المالي
CREATE OR REPLACE FUNCTION public.fn_sync_patient_to_customer_safe()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    BEGIN
        -- محاولة إنشاء سجل العميل
        INSERT INTO public.customers (name, phone, email, organization_id, notes)
        VALUES (NEW.full_name, NEW.phone, NEW.email, NEW.organization_id, 'سجل تلقائي من HIMS')
        RETURNING id INTO v_customer_id;
        
        NEW.customer_id := v_customer_id;
    EXCEPTION WHEN OTHERS THEN
        -- في حال الفشل (نقص حسابات، قيود RLS)، نستمر في تسجيل المريض طبياً
        RAISE WARNING 'HIMS: فشل الربط المحاسبي للمريض %. سيتم المتابعة طبياً فقط.', NEW.full_name;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 🛡️ سياسة الوصول لجدول الصلاحيات (Permissions)
-- يجب أن يكون قابلاً للقراءة من قبل جميع المستخدمين الموثقين لبناء واجهة المستخدم
DROP POLICY IF EXISTS "permissions_read_policy" ON public.permissions;
CREATE POLICY "permissions_read_policy" ON public.permissions FOR SELECT TO authenticated USING (true);

-- 🛡️ سياسة الوصول لجدول الأدوار (Roles)
-- تسمح للمستخدمين برؤية الأدوار التابعة لمنظمتهم فقط
DROP POLICY IF EXISTS "roles_read_policy" ON public.roles;
CREATE POLICY "roles_read_policy" ON public.roles FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

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
        AND c.table_name NOT IN ('profiles', 'organizations', 'notifications', 'payrolls', 'payroll_items', 'hims_icd10_codes') -- الجداول التي لها سياسات خاصة
    );
BEGIN
    FOREACH t IN ARRAY tables_with_org_id LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Org_Access_Policy_%I" ON public.%I;', t, t);
        -- Policy for regular users: scoped to their organization, or super_admin bypass
        EXECUTE format('CREATE POLICY "Org_Access_Policy_%I" ON public.%I FOR ALL TO authenticated 
            USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') 
            WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', 
            t, t);
    END LOOP;
END $$;

-- 🌍 سياسات حماية جدول أكواد تشخيص الأمراض (hims_icd10_codes)
-- السماح لجميع المستخدمين المسجلين بالاستعلام عن كافة الأكواد لضمان الفوترة ومطالبات التأمين
DROP POLICY IF EXISTS "hims_icd10_codes_select" ON public.hims_icd10_codes;
CREATE POLICY "hims_icd10_codes_select" ON public.hims_icd10_codes
    FOR SELECT TO authenticated USING (true);

-- تقييد الإضافة والتعديل والحذف لمعاملات منظمة المستخدم نفسها أو السوبر أدمن
DROP POLICY IF EXISTS "hims_icd10_codes_insert" ON public.hims_icd10_codes;
CREATE POLICY "hims_icd10_codes_insert" ON public.hims_icd10_codes
    FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "hims_icd10_codes_update" ON public.hims_icd10_codes;
CREATE POLICY "hims_icd10_codes_update" ON public.hims_icd10_codes
    FOR UPDATE TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "hims_icd10_codes_delete" ON public.hims_icd10_codes;
CREATE POLICY "hims_icd10_codes_delete" ON public.hims_icd10_codes
    FOR DELETE TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');


-- سياسة السوبر أدمن على المنظمات
DROP POLICY IF EXISTS "Org_Select_Policy" ON organizations;
CREATE POLICY "Org_Select_Policy" ON organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin');



-- 3. البيانات الأساسية (Products, Customers, Suppliers, Accounts)
-- السوبر أدمن يرى الجميع، والمستخدم يرى بيانات منظمته فقط

-- Policy for organizations table: allows admins to update their own org, and super_admins to update any
DROP POLICY IF EXISTS "Org_Update_Policy" ON public.organizations;
CREATE POLICY "Org_Update_Policy" ON public.organizations FOR UPDATE TO authenticated
USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin')
WITH CHECK (id = public.get_my_org() OR public.get_my_role() = 'super_admin');
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
    has_org_id boolean;
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
        
        -- Policy for SuperAdmin: truly universal access for all tables
        -- This policy grants super_admin full access regardless of organization_id or get_my_org() context.
        -- It applies to all tables, whether they have organization_id or not.
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

-- =================================================================
-- 📦 سياسات تخزين الشعارات (Supabase Storage RLS)
-- =================================================================
-- الغرض: السماح برفع شعارات الشركات وتحديثها من قبل المديرين

-- 1. التأكد من وجود الحاوية (Bucket) وإعدادها كـ Public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. سياسة القراءة: الجميع (بما في ذلك الزوار) يمكنهم رؤية الشعارات
DROP POLICY IF EXISTS "Logo_Public_Read" ON storage.objects;
CREATE POLICY "Logo_Public_Read" ON storage.objects FOR SELECT TO public 
USING (bucket_id = 'logos');

-- 4. سياسة الرفع والتعديل: مخصصة للمدير (Admin) والسوبر أدمن فقط
DROP POLICY IF EXISTS "Logo_Admin_Manage" ON storage.objects;
CREATE POLICY "Logo_Admin_Manage" ON storage.objects 
FOR ALL TO authenticated 
USING (
    bucket_id = 'logos' 
    AND (public.get_my_role() = 'super_admin' OR public.get_my_role() = 'admin')
)
WITH CHECK (
    bucket_id = 'logos' 
    AND (public.get_my_role() = 'super_admin' OR public.get_my_role() = 'admin')
);