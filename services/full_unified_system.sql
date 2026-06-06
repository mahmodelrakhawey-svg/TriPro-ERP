-- 🌟 محرك النظام الشامل الموحد (TriPro ERP Unified Engine V50.0)
-- 📅 تاريخ التحديث: 2024-05-25
-- ℹ️ الوصف: دمج شامل (الهيكل + الترميم + الدوال + التصنيع + المطعم + الأمان)
-- 🛡️ مبدأ العمل: Idempotent (آمن للتشغيل المتكرر دون فقدان بيانات)

-- ================================================================
-- 1. المرحلة الهيكلية والترميم (Base Schema & Healing)
-- ================================================================

DO $$ 
DECLARE 
    t text;
    tables_to_heal text[] := ARRAY['organizations', 'profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'employees', 'bill_of_materials', 'mfg_production_orders', 'delivery_orders', 'payments', 'payrolls', 'payroll_items', 'projects', 'project_boq', 'project_progress_billings', 'subcontractors', 'subcontractor_contracts', 'subcontractor_billings', 'project_material_issues', 'project_material_issue_items', 'project_daily_reports', 'project_retention_releases', 'project_milestones', 'project_custodies', 'project_custody_expenses', 'uom_categories', 'uoms',
    'sales_returns', 'sales_return_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'stock_adjustment_items', 'stock_transfers', 'stock_transfer_items', 'inventory_counts', 'inventory_count_items'];
BEGIN
    -- 🛡️ إنشاء جداول وحدات القياس (UoM) إذا لم تكن موجودة
    CREATE TABLE IF NOT EXISTS public.uom_categories (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.uoms (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        category_id uuid REFERENCES public.uom_categories(id) ON DELETE CASCADE,
        name text NOT NULL,
        uom_type text CHECK (uom_type IN ('reference', 'smaller', 'bigger')),
        ratio numeric(19,4) DEFAULT 1,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now(),
        UNIQUE(organization_id, name)
    );

    -- ضمان وجود عمود organization_id في كافة الجداول الأساسية
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
        END IF;
    END LOOP;

    -- ترميم أعمدة التكلفة في جدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_uom_id uuid REFERENCES public.uoms(id);
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_uom_id uuid REFERENCES public.uoms(id);
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_uom_id uuid REFERENCES public.uoms(id);
    END IF;

    -- ترميم أعمدة المستودعات في أوامر البيع والشراء
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
    END IF;

    -- 🛡️ ترميم جدول طلبات التوصيل لإضافة الطيار (Drivers Support)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.employees(id);
    END IF;

    -- 🛡️ ترميم جداول السندات (Treasury Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    -- 🛡️ ترميم جدول الرواتب (Payroll Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payrolls' AND table_schema = 'public') THEN
        ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS payment_date date;
    END IF;

    -- ترميم أعمدة الإغلاق السنوي في إعدادات الشركة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings' AND table_schema = 'public') THEN
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS last_closed_year integer;
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS last_closed_date date;
    END IF;

    -- 🛡️ حقن عمود uom_id في كافة مفاصل النظام لضمان دقة التحويل (Multi-UoM Core)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoice_items') THEN ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opening_inventories') THEN ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_return_items') THEN ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_return_items') THEN ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_adjustment_items') THEN ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_transfer_items') THEN ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_count_items') THEN ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_of_materials') THEN ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_material_request_items') THEN ALTER TABLE public.mfg_material_request_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF; -- 🛡️ إصلاح خطأ الاختبار
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_step_materials') THEN ALTER TABLE public.mfg_step_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_material_issue_items') THEN ALTER TABLE public.project_material_issue_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotation_items') THEN ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_actual_material_usage') THEN ALTER TABLE public.mfg_actual_material_usage ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_transfer_items') THEN ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    
    -- 🛡️ إضافة سياسات الأمان للوحدات
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uoms') THEN
        EXECUTE 'CREATE POLICY "Org_Access_Policy_uoms" ON public.uoms FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'')';
        EXECUTE 'CREATE POLICY "Org_Access_Policy_uom_categories" ON public.uom_categories FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'')';
    END IF;
END $$;

-- ================================================================
-- 2. دوال الهوية والوصول (Identity Helpers)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role() 
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '')
    );
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
BEGIN
    -- الأولوية لبيانات التوكن (JWT) لسرعة الأداء في الـ RLS
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    
    -- Fallback للبحث في البروفايل
    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN _org_id;
END; $$;

-- 🛠️ دالة تحويل الكميات بين الوحدات (UoM Conversion Logic)
CREATE OR REPLACE FUNCTION public.uom_convert(
    p_qty numeric,
    p_from_uom_id uuid,
    p_to_uom_id uuid
) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
    v_from_ratio numeric;
    v_from_type text;
    v_to_ratio numeric;
    v_to_type text;
BEGIN
    IF p_from_uom_id IS NULL OR p_to_uom_id IS NULL OR p_from_uom_id = p_to_uom_id THEN RETURN p_qty; END IF;
    
    SELECT ratio, uom_type INTO v_from_ratio, v_from_type FROM public.uoms WHERE id = p_from_uom_id;
    SELECT ratio, uom_type INTO v_to_ratio, v_to_type FROM public.uoms WHERE id = p_to_uom_id;
    
    -- 🛡️ تصحيح منطق التحويل بناءً على نوع الوحدة
    -- إذا كانت الوحدة 'أصغر' (smaller)، فإن النسبة تعني كم وحدة منها توجد في الوحدة المرجعية (لذا المعامل الحقيقي هو المقلوب)
    IF v_from_type = 'smaller' THEN v_from_ratio := 1.0 / NULLIF(v_from_ratio, 0); END IF;
    IF v_to_type = 'smaller' THEN v_to_ratio := 1.0 / NULLIF(v_to_ratio, 0); END IF;
    
    -- المعادلة: (الكمية * نسبة الوحدة الأصلية) / نسبة الوحدة المستهدفة
    RETURN ROUND((p_qty * COALESCE(v_from_ratio, 1.0)) / COALESCE(v_to_ratio, 1.0), 4);
END; $$;

-- 🛡️ تحديث: درع حماية الحسابات السيادية (ليسمح بالحذف في وضع الاستعادة)
CREATE OR REPLACE FUNCTION public.fn_protect_system_accounts() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 🛑 إذا كان وضع الاستعادة نشطاً، اسمح بالحذف فوراً (تستخدم عند حذف المنظمة بالكامل)
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    -- 🚀 صمام أمان: إذا كانت المنظمة نفسها غير موجودة (تم حذفها بالفعل)، اسمح بحذف الحسابات التابعة لها
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
        RETURN OLD;
    END IF;

    -- الحماية الطبيعية أثناء العمل اليومي
    IF OLD.code IN ('1', '2', '3', '4', '5', '1221', '201', '311', '1231') THEN
        RAISE EXCEPTION '⚠️ خطأ سيادي: لا يمكن حذف الحساب (%) لأنه حساب نظام أساسي مرتبط بالتقارير المالية والقيود الآلية.', OLD.name;
    END IF;

    RETURN OLD;
END; $$;

-- ربط الدرع بجدول الحسابات
DROP TRIGGER IF EXISTS trg_protect_system_accounts ON public.accounts;
CREATE TRIGGER trg_protect_system_accounts BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.fn_protect_system_accounts();

-- 🛠️ دالة حذف المنظمة بأمان (تجاوز الحماية السيادية)
CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. التحقق من الصلاحيات (يجب أن يكون سوبر أدمن)
    IF public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: غير مصرح لك بحذف المنظمات من هذا المستوى.';
    END IF;

    -- 2. تفعيل وضع التجاوز (Restore Mode) لتعطيل حماية الحسابات "السيادية"
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 3. حذف المنظمة (سيتم حذف كل شيء بفضل ON DELETE CASCADE)
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- 4. إعادة الوضع الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);
END; $$;

-- 🛠️ دالة مساعدة لضمان الترحيل إلى حساب فرعي (Resolve Leaf Account)
CREATE OR REPLACE FUNCTION public.resolve_leaf_account(p_account_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_leaf_id uuid;
BEGIN
    IF p_account_id IS NULL THEN RETURN NULL; END IF;

    -- البحث المتعمق عن أول حساب "ورقة" (Leaf) سواء كان الحساب الممرر هو الورقة أو أحد أبنائه
    WITH RECURSIVE coa_tree AS (
        SELECT id, is_group, code FROM public.accounts WHERE id = p_account_id
        UNION ALL
        SELECT a.id, a.is_group, a.code FROM public.accounts a JOIN coa_tree ct ON a.parent_id = ct.id
    )
    SELECT id INTO v_leaf_id FROM coa_tree WHERE is_group = false ORDER BY code LIMIT 1;

    -- 🛡️ إذا لم نجد حساب فرعي (حالة نادرة)، نرجع الحساب الأصلي ليتولى الـ Trigger المنع بدلاً من انهيار الدالة بـ NULL
    RETURN COALESCE(v_leaf_id, p_account_id);
END; $$;

-- ================================================================
-- 2.5 دوال النسخ الاحتياطي (Backup Functions)
-- ================================================================

-- 🛡️ تنظيف النسخ القديمة لتجنب خطأ تعارض أنواع البيانات (HINT: 42P13)
DROP FUNCTION IF EXISTS public.create_organization_backup(uuid, text);
DROP FUNCTION IF EXISTS public.restore_organization_from_backup(uuid);
DROP FUNCTION IF EXISTS public.validate_backup_integrity(uuid, jsonb);
DROP FUNCTION IF EXISTS public.run_daily_backups_all_orgs();

-- �️ دالة إنشاء نسخة احتياطية لمنظمة محددة
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_user_id uuid := auth.uid(); -- User performing the backup
    v_org_name text;
BEGIN
    -- Get organization name for notes
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    -- Iterate through all tables that have an organization_id column
    FOR v_table_name IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'organization_id'
          AND EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE')
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles', 'auth.users') -- Exclude core system tables or tables with special RLS
    LOOP
        BEGIN
            -- Select all data for the given organization from the current table
            EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.organization_id = %L', v_table_name, p_org_id)
            INTO v_table_data;
            
            -- Add table data to the main backup JSONB object
            -- Use jsonb_set to add/update a key-value pair in the JSONB object
            v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], COALESCE(v_table_data, '[]'::jsonb), true);
            
            -- Optional: Log progress
            -- RAISE NOTICE 'Backed up data from table % for organization %', v_table_name, p_org_id;

        EXCEPTION
            WHEN UNDEFINED_COLUMN THEN
                RAISE WARNING 'Table % does not have organization_id column, skipping.', v_table_name;
            WHEN OTHERS THEN
                RAISE WARNING 'Error backing up table % for organization %: %', v_table_name, p_org_id, SQLERRM;
        END;
    END LOOP;

    -- Insert the backup record
    INSERT INTO public.organization_backups (organization_id, backup_data, file_size_kb, user_id, notes)
    VALUES (
        p_org_id,
        v_backup_data,
        pg_column_size(v_backup_data) / 1024.0, -- Size in KB
        COALESCE(v_user_id, auth.uid()),
        COALESCE(p_notes, 'Daily backup for ' || v_org_name)
    ) RETURNING id INTO v_backup_id;

    -- 🛡️ تنظيف النسخ القديمة: الاحتفاظ بآخر 5 نسخ فقط لكل شركة لضمان توفير المساحة
    DELETE FROM public.organization_backups
    WHERE id IN (
        SELECT id
        FROM public.organization_backups
        WHERE organization_id = p_org_id
        ORDER BY backup_date DESC
        OFFSET 5
    );

    RETURN v_backup_id;
END; $$;

-- 🛠️ دالة تشغيل النسخ الاحتياطي لجميع المنظمات النشطة
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_backup_count int := 0;
    v_error_message text;
BEGIN
    FOR v_org_id IN SELECT id FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            PERFORM public.create_organization_backup(v_org_id, 'Automated daily backup');
            v_backup_count := v_backup_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_error_message := SQLERRM;
            RAISE WARNING 'Failed to create backup for organization %: %', v_org_id, v_error_message;
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
            VALUES (v_error_message, jsonb_build_object('organization_id', v_org_id), 'run_daily_backups_all_orgs', v_org_id);

            -- 🔔 إرسال تنبيه ذكي للسوبر أدمن عند فشل النسخة الاحتياطية
            INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
            SELECT id, '⚠️ فشل النسخ الاحتياطي', 
                   format('فشل النظام في إنشاء نسخة للمنظمة (%s). يرجى التحقق من سجل الأخطاء.', 
                          (SELECT name FROM public.organizations WHERE id = v_org_id)), 
                   'high', v_org_id, 'system_error'
            FROM public.profiles 
            WHERE role = 'super_admin' AND is_active = true;
        END;
    END LOOP;
    RETURN 'Successfully created ' || v_backup_count || ' backups.';
END; $$;

-- 🛠️ دالة فحص سلامة النسخة الاحتياطية قبل الاستعادة
CREATE OR REPLACE FUNCTION public.validate_backup_integrity(p_org_id uuid, p_backup_data jsonb)
RETURNS TABLE (name text, status text, message text) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table_name text;
    v_missing_tables text[] := '{}';
    v_critical_tables text[] := ARRAY['accounts', 'products', 'journal_entries'];
    v_table_exists boolean;
BEGIN
    -- 1. التحقق من صحة هيكل الـ JSON
    name := 'صحة هيكل البيانات';
    IF jsonb_typeof(p_backup_data) != 'object' THEN
        status := 'fail';
        message := 'بيانات النسخة الاحتياطية تالفة أو ليست بتنسيق JSON صحيح.';
        RETURN NEXT;
        RETURN; 
    ELSE
        status := 'pass';
        message := 'هيكل البيانات سليم.';
        RETURN NEXT;
    END IF;

    -- 2. التحقق من تطابق الجداول مع النظام الحالي
    FOR v_table_name IN SELECT jsonb_object_keys(p_backup_data) LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_table_name
        ) INTO v_table_exists;
        
        IF NOT v_table_exists THEN
            v_missing_tables := array_append(v_missing_tables, v_table_name);
        END IF;
    END LOOP;

    name := 'توافق الجداول';
    IF array_length(v_missing_tables, 1) > 0 THEN
        status := 'warning';
        message := 'تحتوي النسخة على جداول غير موجودة في النظام الحالي (سيتم تجاهلها): ' || array_to_string(v_missing_tables, ', ');
    ELSE
        status := 'pass';
        message := 'جميع جداول النسخة متوافقة مع النظام.';
    END IF;
    RETURN NEXT;

    -- 3. التحقق من وجود الجداول السيادية (Critical Tables)
    name := 'سلامة البيانات الأساسية';
    v_missing_tables := '{}';
    FOREACH v_table_name IN ARRAY v_critical_tables LOOP
        IF NOT (p_backup_data ? v_table_name) THEN
            v_missing_tables := array_append(v_missing_tables, v_table_name);
        END IF;
    END LOOP;

    IF array_length(v_missing_tables, 1) > 0 THEN
        status := 'fail';
        message := 'النسخة تفتقر لجداول حيوية (لا يمكن الاستعادة): ' || array_to_string(v_missing_tables, ', ');
    ELSE
        status := 'pass';
        message := 'الجداول الحيوية موجودة.';
    END IF;
    RETURN NEXT;

    -- 4. التحقق من ملكية البيانات (Organization Match)
    name := 'التحقق من ملكية البيانات';
    v_table_name := (SELECT jsonb_object_keys(p_backup_data) LIMIT 1);
    IF v_table_name IS NOT NULL AND jsonb_array_length(p_backup_data->v_table_name) > 0 THEN
        IF (p_backup_data->v_table_name->0->>'organization_id')::uuid != p_org_id THEN
            status := 'fail';
            message := 'هذه النسخة تنتمي لمنظمة أخرى ولا يمكن استعادتها لهذه الشركة.';
        ELSE
            status := 'pass';
            message := 'البيانات تنتمي لهذه المنظمة بشكل صحيح.';
        END IF;
    ELSE
        status := 'warning';
        message := 'لا توجد بيانات كافية في النسخة للتحقق من ملكية المنظمة.';
    END IF;
    RETURN NEXT;
END; $$;

-- 🛠️ دالة استعادة بيانات منظمة من نسخة احتياطية محددة
CREATE OR REPLACE FUNCTION public.restore_organization_from_backup(p_backup_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup record;
    v_table_name text;
    v_count int := 0;
    v_total_inserted int := 0;
BEGIN
    -- 1. جلب بيانات النسخة والتحقق من وجودها
    SELECT * INTO v_backup FROM public.organization_backups WHERE id = p_backup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'النسخة الاحتياطية غير موجودة.'; END IF;

    -- 🛡️ تفعيل وضع الاستعادة وتعطيل القيود مؤقتاً
    PERFORM set_config('app.restore_mode', 'on', true);
    -- ملاحظة: في PostgreSQL لا يمكن تعطيل القيود إلا داخل Transaction، ونحن هنا بالفعل داخل واحد.

    -- 2. استرجاع قائمة الجداول وتفريغ البيانات (ترتيب الحذف مهم ولكن ON DELETE CASCADE تتكفل بمعظمه)
    FOR v_table_name IN SELECT jsonb_object_keys(v_backup.backup_data)
    LOOP
        -- أ. حذف البيانات الحالية (باستخدام حماية لمنع حذف بيانات منظمات أخرى)
        EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_table_name, v_backup.organization_id);

        -- ب. إعادة حقن السجلات باستخدام Bulk Insert لتحسين الأداء (V52.0)
        EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, %L)', 
                       v_table_name, v_table_name, v_backup.backup_data -> v_table_name);
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total_inserted := v_total_inserted + v_count;
    END LOOP;

    -- 🚀 إعادة تنشيط محرك المخزون لضمان دقة الأرصدة بعد الاستعادة
    PERFORM public.recalculate_stock_rpc(v_backup.organization_id);
    PERFORM set_config('app.restore_mode', 'off', true);

    -- 🛡️ تسجيل العملية في سجل الأمان (Audit Log) لضمان المحاسبية
    INSERT INTO public.security_logs (
        event_type, 
        description, 
        performed_by, 
        organization_id, 
        metadata
    ) VALUES (
        'data_restore',
        'تمت استعادة بيانات المنظمة من نسخة احتياطية رقم: ' || p_backup_id,
        auth.uid(),
        v_backup.organization_id,
        jsonb_build_object('backup_id', p_backup_id, 'records_count', v_total_inserted, 'backup_date', v_backup.backup_date)
    );
    
    RETURN '✅ تمت الاستعادة بنجاح. إجمالي السجلات المسترجعة: ' || v_total_inserted;
END; $$;

-- 🛠️ دالة التحقق الشامل من شمولية النسخة (Comprehensiveness Check)
-- الغرض: مقارنة هيكل الجداول الحالي مع محتويات النسخة لضمان عدم سقوط أي مديول (مثل المستشفيات)
CREATE OR REPLACE FUNCTION public.verify_backup_comprehensiveness(p_backup_id uuid)
RETURNS TABLE (
    "اسم الجدول" text,
    "الحالة في النسخة" text,
    "عدد السجلات في النسخة" int,
    "عدد السجلات الحالية بالشركة" bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup record;
    v_tbl record;
BEGIN
    -- 1. جلب بيانات النسخة
    SELECT * INTO v_backup FROM public.organization_backups WHERE id = p_backup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'النسخة الاحتياطية غير موجودة.'; END IF;

    -- 2. المسح الشامل لجميع الجداول التي تخص المنظمات (SaaS Tables)
    FOR v_tbl IN 
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name
        WHERE c.table_schema = 'public' 
          AND c.column_name = 'organization_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles')
    LOOP
        "اسم الجدول" := v_tbl.table_name;
        
        IF v_backup.backup_data ? "اسم الجدول" THEN
            "الحالة في النسخة" := '✅ مشمول';
            "عدد السجلات في النسخة" := jsonb_array_length(v_backup.backup_data -> "اسم الجدول");
        ELSE
            "الحالة في النسخة" := '❌ مفقود من النسخة';
            "عدد السجلات في النسخة" := 0;
        END IF;

        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id = %L', v_tbl.table_name, v_backup.organization_id)
        INTO "عدد السجلات الحالية بالشركة";

        RETURN NEXT;
    END LOOP;
END; $$;

-- ================================================================
-- 3. محرك المخزون الشامل (The Master Stock Engine)
-- ================================================================
-- 🛡️ تحديث V50.5: ضمان تصفير الأصناف التي ليس لها حركات عند إعادة الاحتساب الجزئي
-- 🛡️ تحديث V50.4: إضافة p_product_id لدعم إعادة الاحتساب لصنف محدد وحل خطأ 404
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid);
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 🚀 استخدام جدول مؤقت لحل مشكلة نطاق الـ CTE وضمان الدقة في عمليتي التحديث (V50.6)
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        -- تجميع كافة حركات الداخل والخارج في استعلام واحد
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- رصيد افتتاحي
            SELECT oi.product_id, oi.warehouse_id, public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            UNION ALL
            -- مشتريات (+)
            SELECT pii.product_id, pi.warehouse_id, public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- مبيعات (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT ii.product_id, i.warehouse_id, -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة (مع مراعاة وحدات المكونات)
            SELECT bom.raw_material_id, i.warehouse_id, -(public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            JOIN public.products p ON ii.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, o.warehouse_id, -(public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            JOIN public.products p ON oi.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND bom.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR o.organization_id = v_final_org)
            UNION ALL
            -- تصنيع تام (+) 
            SELECT product_id, warehouse_id, quantity_to_produce FROM public.mfg_production_orders 
            WHERE UPPER(status) = 'COMPLETED' AND warehouse_id IS NOT NULL AND product_id IS NOT NULL AND (v_final_org IS NULL OR organization_id = v_final_org)
            UNION ALL
            -- استهلاك خامات (-)
            SELECT amu.raw_material_id, po.warehouse_id, -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE po.warehouse_id IS NOT NULL AND amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ استهلاك خامات بطلبات صرف (MR) (منضبط بالوحدات)
            SELECT mri.raw_material_id, po.warehouse_id, -public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id)
            FROM public.mfg_material_request_items mri
            JOIN public.products p ON mri.raw_material_id = p.id
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
            WHERE mr.status = 'issued' AND po.warehouse_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            AND NOT EXISTS (
                SELECT 1 FROM public.mfg_order_progress op_sub
                JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
                WHERE op_sub.production_order_id = po.id AND amu_sub.raw_material_id = mri.raw_material_id
            )

            UNION ALL
            -- 🏗️ استهلاك مواد لمشاريع المقاولات (-)
            SELECT pmii.product_id, pmi.warehouse_id, -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id)
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)

            UNION ALL
            -- 🔄 مرتجعات مبيعات (+)
            SELECT sri.product_id, sr.warehouse_id, public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id)
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id JOIN public.products p ON sri.product_id = p.id
            WHERE sr.status = 'posted' AND (v_final_org IS NULL OR sr.organization_id = v_final_org)

            UNION ALL
            -- 🔄 مرتجعات مشتريات (-)
            SELECT pri.product_id, pr.warehouse_id, -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id)
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id JOIN public.products p ON pri.product_id = p.id
            WHERE pr.status = 'posted' AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- 🛠️ تسويات مخزنية (+/-)
            SELECT sai.product_id, sa.warehouse_id, public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id)
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- 🚚 تحويلات مخزنية (صادر -)
            SELECT sti.product_id, st.from_warehouse_id, -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
            
            UNION ALL
            -- 🏥 استهلاك المستشفيات (HIMS Consumption) (-)
            -- يجمع الأدوية المصروفة ومستلزمات العمليات
            SELECT hbi.product_id, hbi.warehouse_id, -public.uom_convert(hbi.quantity, hbi.uom_id, p.base_uom_id)
            FROM public.hims_billing_items hbi
            JOIN public.products p ON hbi.product_id = p.id
            WHERE hbi.product_id IS NOT NULL AND hbi.warehouse_id IS NOT NULL
            AND (v_final_org IS NULL OR hbi.organization_id = v_final_org)

            UNION ALL
            -- 🚚 تحويلات مخزنية (وارد +)
            SELECT sti.product_id, st.to_warehouse_id, public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
        ) movements
        WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, warehouse_id
    )
    SELECT 
        product_id, 
        SUM(net_qty) as total_stock,
        jsonb_object_agg(warehouse_id::text, net_qty) as wh_json
    FROM warehouse_movement
    GROUP BY product_id;

    -- 🛡️ 1. تحديث الأصناف التي لها حركات فعلاً
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- 🛡️ 2. تصفير الأصناف التي لا تمتلك حركات (لضمان مطابقة الواقع)
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
      
        -- 🔔 نظام التنبيهات اللحظي (Real-time Alerts)
    INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
    SELECT prof.id, 'نقص مخزون حرج', format('الصنف %s وصل إلى %s', p.name, p.stock), 'high', p.organization_id, 'low_inventory'
    FROM public.products p
    JOIN public.profiles prof ON p.organization_id = prof.organization_id
    WHERE p.stock <= COALESCE(p.min_stock, 0) AND p.min_stock > 0 AND prof.role IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;

END; $$;

-- 🛠️ دالة إعادة تقييم التكلفة (Inventory Revaluation)
CREATE OR REPLACE FUNCTION public.revalue_product_cost(
    p_new_cost numeric,
    p_notes text,
    p_org_id uuid,
    p_product_id uuid,
    p_revaluation_date date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.products 
    SET weighted_average_cost = p_new_cost,
        purchase_price = p_new_cost,
        cost = p_new_cost
    WHERE id = p_product_id AND organization_id = p_org_id;

    PERFORM public.recalculate_stock_rpc(p_org_id, p_product_id);
END; $$;

-- 🛠️ دالة تسجيل الهالك (Record Wastage)
CREATE OR REPLACE FUNCTION public.record_wastage(
    p_date date,
    p_items jsonb,
    p_notes text,
    p_warehouse_id uuid,
    p_org_id uuid DEFAULT public.get_my_org(),
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_adj_id uuid;
    v_item jsonb;
    v_adj_num text;
BEGIN
    v_adj_num := 'WST-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    
    INSERT INTO public.stock_adjustments (adjustment_date, notes, warehouse_id, organization_id, created_by, adjustment_number, status, reason)
    VALUES (p_date, p_notes, p_warehouse_id, p_org_id, p_user_id, v_adj_num, 'posted', 'الهالك (Wastage)')
    RETURNING id INTO v_adj_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.stock_adjustment_items (stock_adjustment_id, product_id, quantity, type, organization_id)
        VALUES (v_adj_id, (v_item->>'productId')::uuid, -ABS((v_item->>'quantity')::numeric), 'out', p_org_id);
    END LOOP;

    PERFORM public.recalculate_stock_rpc(p_org_id);
    RETURN v_adj_id;
END; $$;

-- ================================================================
-- 4. مديول المطاعم ونقاط البيع (Restaurant & POS Module)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع الدوال (Aggressive Function Purge)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('start_pos_shift', 'create_restaurant_order', 'complete_restaurant_order', 'create_public_order', 'generate_shift_closing_entry') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة بدء الوردية
CREATE OR REPLACE FUNCTION public.get_active_shift(
    p_user_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid;
    v_shift public.shifts;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    IF v_org_id IS NULL THEN RETURN NULL::public.shifts; END IF;

    SELECT * INTO v_shift FROM public.shifts
    WHERE user_id = COALESCE(p_user_id, auth.uid()) 
      AND end_time IS NULL 
      AND organization_id = v_org_id
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ تصحيح V50.3: ضمان إعادة NULL صريح لتجنب الكائن الوهمي {id: null}
    IF v_shift.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN v_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة.'; END IF;

    SELECT * INTO v_existing_shift FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ إذا طلب المستخدم الاستئناف ووجدنا وردية، نعيدها
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- 🛡️ إذا طلب المستخدم الاستئناف ولم نجد، نعيد NULL للتوقف هنا
    IF p_resume_existing THEN RETURN NULL; END IF;

    IF v_existing_shift.id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم في هذه الشركة. يرجى إغلاقها أولاً.'; END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    SELECT vat_rate INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id;
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 جلب التكلفة اللحظية للصنف لضمان دقة تقرير COGS لاحقاً
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id INTO v_item_cost, v_final_wh_id -- نستخدم v_final_wh_id مؤقتاً لتخزين معرف الوحدة الأساسية
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, organization_id, modifiers, uom_id)
        VALUES (
            v_order_id, 
            (v_item->>'product_id')::uuid, 
            (v_item->>'quantity')::numeric, 
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        -- إرسال للمطبخ فوراً 👨‍🍳
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    -- 🚀 تحديث الإجماليات بدقة لتشمل الضريبة ورسوم التوصيل
    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- 🛠️ دالة جلب رصيد حساب في تاريخ محدد (مطلوبة للاختبارات والتقارير)
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
            FROM public.journal_lines jl
            JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = p_account_id AND je.organization_id = p_org_id AND je.status = 'posted' AND je.transaction_date <= p_date);
END; $$;

-- 🛠️ دالة إتمام طلب المطعم (الدفع والتحرير)
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
    p_order_id uuid, p_payment_method text, p_amount numeric, p_cash_account_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_org_id uuid;
    v_table_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status IN ('PAID', 'COMPLETED') THEN RETURN; END IF;
    v_org_id := v_order.organization_id;

    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة عند الإتمام لضمان دقة خصم المخزون
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != COALESCE(v_order.warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        UPDATE public.orders SET warehouse_id = p_warehouse_id WHERE id = p_order_id;
    END IF;

    -- 1. تسجيل الدفع
    INSERT INTO public.payments (order_id, amount, payment_method, status, organization_id, cash_account_id)
    VALUES (p_order_id, p_amount, p_payment_method, 'COMPLETED', v_org_id, p_cash_account_id);

    -- 2. تحديث حالة الطلب
    UPDATE public.orders SET status = 'PAID' WHERE id = p_order_id;

    -- 3. تحرير الطاولة والجلسة
    IF v_order.session_id IS NOT NULL THEN
        SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_order.session_id;
        UPDATE public.table_sessions SET end_time = now(), status = 'CLOSED' WHERE id = v_order.session_id;
        UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL WHERE id = v_table_id;
    END IF;

    -- 4. تحديث المخزون فوراً 🚀
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 📱 دالة المنيو الإلكتروني (QR Menu Order)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record; v_session_id uuid; v_order_id uuid;
BEGIN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز طاولة غير صالح.'; END IF;

    -- إيجاد أو فتح جلسة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_table.organization_id LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN') RETURNING id INTO v_session_id;
    END IF;

    -- إنشاء الطلب عبر الدالة الموحدة
    v_order_id := public.create_restaurant_order(
        v_session_id, NULL, 'DINE_IN', 'طلب عبر QR', p_items, NULL, NULL, NULL, COALESCE(p_org_id, v_table.organization_id)
    );

    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;
    RETURN v_order_id;
END; $$;

-- 🛠️ دالة إصلاح القيود غير المتوازنة (Auto-Balancer)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'fix_unbalanced_journal_entry' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_diff numeric; v_org_id uuid; v_suspense_acc_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.journal_entries WHERE id = p_je_id;
    DELETE FROM public.journal_lines WHERE journal_entry_id = p_je_id AND description = 'توازن آلي (فرق مدين/دائن)';
    SELECT SUM(debit) - SUM(credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = p_je_id;
    IF ABS(COALESCE(v_diff, 0)) < 0.001 THEN RETURN; END IF;
    SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999' LIMIT 1;
    IF v_diff > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, 0, ABS(v_diff), 'توازن آلي (فرق مدين/دائن)', v_org_id);
    ELSE 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, ABS(v_diff), 0, 'توازن آلي (فرق مدين/دائن)', v_org_id);
    END IF;
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع للوردية (The Heart of POS Accounting)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
BEGIN
    -- 🛡️ التأكد من أن المعرّف الممرر ليس فارغاً
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    -- 🛡️ استخدام NOT FOUND لرفع استثناء حقيقي بدلاً من التعامل مع حقول فارغة
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    
    -- 🛡️ صمام أمان: لا تسمح بتوليد القيد إذا كانت الوردية لا تزال مفتوحة
    -- تم التعطيل مؤقتاً للسماح بالإصلاح اليدوي للورديات العالقة

    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- 🚀 استخدام جدول مؤقت لتجنب مشاكل النطاق وتحسين الأداء (V50.7)
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
        OR 
        (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        -- 🚀 حساب التكلفة بتفكيك الوصفة (BOM Expansion)
        COALESCE((
            SELECT SUM(line_cost) FROM (
                -- 1. الأصناف بدون وصفة
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                -- 2. الأصناف بوصفة (الخامات)
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ [تحديث V51.5] معالجة آمنة لجلب الحسابات لتجنب انهيار القيد عند وجود زيادة أو عجز
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    
    -- حسابات الفروقات (العجز والزيادة) مع صمام أمان
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مطعم', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        -- 🚀 محرك التكلفة الذكي المطور: توجيه التكلفة لحسابات الخامات أو المنتج التام حسب الوصفة
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                -- أصناف مباشرة (10302)
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                -- أصناف بوصفة (10301)
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 4. ميزان التوازن الذكي (Smart Balancing)
    IF v_diff < 0 THEN
        -- حالة العجز: قيد مدين في حساب العجز
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        -- حالة الزيادة: قيد دائن في حساب الزيادة
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL, p_org_id uuid DEFAULT NULL
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.shifts SET 
        end_time = now(), actual_cash = p_actual_cash, status = 'CLOSED', notes = p_notes
    WHERE id = p_shift_id;
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
    
    -- 🏭 [تكامل التصنيع] ترحيل نسب إتمام الإنتاج آلياً عند إغلاق الوردية
    PERFORM public.mfg_auto_post_wip_progress(COALESCE(p_org_id, public.get_my_org()));
END; $$;
-- 🛠️ دالة اعتماد سند القبض محاسبياً (Receipt Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid; v_final_credit_acc_id uuid; v_mappings jsonb;
BEGIN
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    -- تنظيف أي قيود قديمة مرتبطة
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'receipt_voucher';

    -- تحديد الحساب الدائن (تأمين أو عميل)
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN RAISE EXCEPTION 'الحساب الدائن غير محدد لسند القبض.'; END IF;

    -- إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.receipt_date, COALESCE(v_voucher.notes, 'سند قبض'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;
-- 🛠️ دالة اعتماد سند الصرف محاسبياً (Payment Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'payment_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.payment_date, COALESCE(v_voucher.notes, 'سند صرف'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ دالة التحويل المالي بين الخزائن (Treasury Transfer)
CREATE OR REPLACE FUNCTION public.add_treasury_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_notes text,
  p_org_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  -- 1. إنشاء رأس القيد المحاسبي
  INSERT INTO public.journal_entries (
    transaction_date,
    description,
    status,
    organization_id,
    user_id,
    reference
  ) VALUES (
    p_transfer_date,
    p_notes,
    'posted',
    p_org_id,
    p_user_id,
    'TRF-' || TO_CHAR(NOW(), 'YYMMDD-HH24MI')
  ) RETURNING id INTO v_entry_id;

  -- 2. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || p_notes,
    p_org_id
  );

  -- 3. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || p_notes,
    p_org_id
  );

  RETURN v_entry_id;
END;
$$;

-- 🛠️ دالة ترحيل قيد يومية للشيكات (Cheque Journal Entry Engine)
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; v_org_id uuid; v_journal_id uuid; v_bank_acc_id uuid;
    v_customer_acc_id uuid; v_supplier_acc_id uuid; v_notes_pay_acc_id uuid; 
    v_notes_rec_acc_id uuid; v_mappings jsonb; v_description text; v_ref text;
    v_current_stage_type text;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RAISE EXCEPTION 'الشيك غير موجود.'; END IF;
    
    -- 🚀 تحديد نوع القيد بناءً على المرحلة لضمان عدم حذف المراحل السابقة
    v_current_stage_type := CASE 
        WHEN v_cheque.status IN ('issued', 'received') THEN (CASE WHEN v_cheque.type IN ('outgoing', 'out') THEN 'cheque_issuance' ELSE 'cheque_receipt' END)
        WHEN v_cheque.status IN ('collected', 'cashed') THEN (CASE WHEN v_cheque.type IN ('incoming', 'in') THEN 'cheque_collection' ELSE 'cheque_payment' END)
        WHEN v_cheque.status = 'bounced' THEN 'cheque_bounced'
        ELSE 'cheque_other'
    END;

    -- نحذف فقط قيد المرحلة الحالية إذا كان موجوداً لإعادة توليده بدقة
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_cheque.organization_id 
    AND related_document_id = p_cheque_id 
    AND related_document_type = v_current_stage_type;

    v_org_id := v_cheque.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تحديد الحسابات (دعم لكافة أنواع الربط المتاحة)
    v_bank_acc_id := COALESCE(
        v_cheque.current_account_id, 
        (v_mappings->>'BANK_ACCOUNTS')::uuid, 
        (v_mappings->>'BANK_MAIN')::uuid,
        (SELECT id FROM public.accounts WHERE code LIKE '1232%' AND organization_id = v_org_id LIMIT 1)
    );
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '221') AND organization_id = v_org_id LIMIT 1));
    v_notes_pay_acc_id := COALESCE((v_mappings->>'NOTES_PAYABLE')::uuid, (SELECT id FROM public.accounts WHERE code = '222' AND organization_id = v_org_id LIMIT 1));
    v_notes_rec_acc_id := COALESCE((v_mappings->>'NOTES_RECEIVABLE')::uuid, (SELECT id FROM public.accounts WHERE code = '1222' AND organization_id = v_org_id LIMIT 1));

    v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, substring(p_cheque_id::text, 1, 8));

    -- 1. 🟢 مرحلة الإصدار/الاستلام (أوراق القبض والدفع)
    IF v_cheque.status IN ('issued', 'received') THEN
        IF v_cheque.type IN ('outgoing', 'out') THEN
            v_description := 'إصدار شيك صادر رقم ' || v_cheque.cheque_number || ' للمورد ' || v_cheque.party_name;
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_cheque.created_at::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_issuance', true, auth.uid()) RETURNING id INTO v_journal_id;
            -- من ح/ المورد إلى ح/ أوراق الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            v_description := 'استلام شيك وارد رقم ' || v_cheque.cheque_number || ' من العميل ' || v_cheque.party_name;
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_cheque.created_at::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_receipt', true, auth.uid()) RETURNING id INTO v_journal_id;
            -- من ح/ أوراق القبض إلى ح/ العميل
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;

    -- 2. 🔵 مرحلة التحصيل/الصرف (إقفال الأوراق الوسيطة في البنك)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف لهذه المنظمة.'; END IF;
        v_description := 'تحصيل شيك وارد رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_collection', true, auth.uid()) RETURNING id INTO v_journal_id;
        -- من ح/ البنك إلى ح/ أوراق القبض
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف لهذه المنظمة.'; END IF;
        v_description := 'صرف شيك صادر رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_payment', true, auth.uid()) RETURNING id INTO v_journal_id;
        -- من ح/ أوراق الدفع إلى ح/ البنك
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 3. 🔴 مرحلة الارتداد (عكس القيود المفتوحة)
    ELSIF v_cheque.status = 'bounced' THEN
        v_description := 'ارتداد شيك رقم ' || v_cheque.cheque_number;
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, 'REV-' || v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true, auth.uid()) RETURNING id INTO v_journal_id;
        IF v_cheque.type IN ('incoming', 'in') THEN
            -- إعادة المديونية للعميل وإلغاء ورقة القبض
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            -- إعادة الدائنية للمورد وإلغاء ورقة الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;
    END IF;

    IF v_journal_id IS NOT NULL THEN UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id; END IF;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;
-- 🛠️ مشغل تلقائي لتعيين المستودع الافتراضي
CREATE OR REPLACE FUNCTION public.fn_ensure_warehouse() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id LIMIT 1);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 🛠️ مشغل ترحيل الشيكات التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    -- 🚀 التحديث (V50.6): الترحيل عند الإنشاء (INSERT) أو عند تغيير الحالة (UPDATE)
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting AFTER INSERT OR UPDATE OF status ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 🛠️ دالة جلب تقرير الورديات الشهرية
-- تظهر جميع الورديات التي فُتحت وأُغلقت خلال شهر محدد
CREATE OR REPLACE FUNCTION public.get_monthly_shift_report(
    p_org_id uuid DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_year integer DEFAULT NULL
)
RETURNS TABLE (
    shift_id uuid,
    user_full_name text,
    start_time timestamptz,
    end_time timestamptz,
    opening_balance numeric,
    actual_cash numeric,
    difference numeric,
    status text,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_target_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now()));
    v_target_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now()));
BEGIN
    RETURN QUERY
    SELECT s.id, p.full_name, s.start_time, s.end_time, s.opening_balance, s.actual_cash, s.difference, s.status, s.notes
    FROM public.shifts s
    LEFT JOIN public.profiles p ON s.user_id = p.id
    WHERE s.organization_id = v_target_org_id
      AND EXTRACT(MONTH FROM s.start_time) = v_target_month
      AND EXTRACT(YEAR FROM s.start_time) = v_target_year
    ORDER BY s.start_time DESC;
END; $$;

-- ================================================================
-- 5. مديول المبيعات والمشتريات الموحد (Unified Sales & Purchases)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع دوال المبيعات والمشتريات لضمان التوافق مع V50.0
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('approve_invoice', 'post_sales_invoice', 'approve_purchase_invoice', 'post_purchase_invoice') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 🛠️ دالة ترحيل فاتورة المبيعات (Approve Invoice) - النسخة الموحدة V50.0
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_org_id uuid; v_journal_id uuid; v_mappings jsonb;
    v_sales_acc_id uuid; v_vat_acc_id uuid; v_cust_acc_id uuid; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_item record;
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة.'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    
    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة من الواجهة لضمان دقة خصم المخزون اللحظي
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != v_invoice.warehouse_id THEN
        UPDATE public.invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
        v_invoice.warehouse_id := p_warehouse_id;
    END IF;

    -- 2. جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cust_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. حساب تكلفة البضاعة المباعة وتحديث بيانات البنود
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        DECLARE v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
            UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;
        END;
    END LOOP;

    -- 📝 4. إنشاء قيد اليومية المزدوج
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || v_invoice.invoice_number, v_invoice.invoice_number, 'posted', v_org_id, true, p_invoice_id, 'invoice') RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cust_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id);
    IF v_invoice.tax_amount > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات', v_org_id); END IF;
    
    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون تام', v_org_id);
    END IF;

    -- 5. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 🚀 6. تحديث المخزون الشامل لجميع المستودعات (الخصم اللحظي)
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
END; $$;

-- 🛠️ دالة ترحيل فاتورة المشتريات (Approve Purchase Invoice) - V50.0
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb;
BEGIN
      SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديث المستودع إذا تم تمريره
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC) قبل إعادة احتساب المخزون
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        -- 🚀 تحويل الكمية إلى الوحدة الأساسية قبل حساب التكلفة
        DECLARE
            v_base_qty numeric := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_unit_cost_base numeric := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        BEGIN
        UPDATE public.products p SET 
            purchase_price = v_unit_cost_base,
            cost = v_unit_cost_base,
            weighted_average_cost = CASE 
                WHEN (COALESCE(p.stock, 0) + v_base_qty) > 0 
                THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_unit_cost_base)) + (v_base_qty * v_unit_cost_base)) / (COALESCE(p.stock, 0) + v_base_qty), 4)
                ELSE v_unit_cost_base 
            END
        WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات مشتريات', v_org_id), (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
END; $$;

-- 🛠️ الأسماء المستعارة (Aliases) لضمان توافق RPC مع الواجهة الأمامية
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

-- 5. مديول التصنيع المتقدم (Manufacturing Module)
-- ================================================================

-- 📊 رؤية ربحية أمر الإنتاج (Manufacturing Order Profitability View)
-- ضرورية لدالة تحديث الأسعار والتقارير المالية
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
WITH labor_summary AS (
    SELECT
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    GROUP BY op.production_order_id
),
material_summary AS (
    -- 🛡️ منع الازدواجية في المحرك الموحد: نجمع الاستهلاك الفعلي مع طلبات الصرف المستقلة فقط
    SELECT po_id, SUM(cost) as total_material_cost FROM (
        SELECT op.production_order_id as po_id, SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)) as cost
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        GROUP BY op.production_order_id, amu.raw_material_id
        UNION ALL
        SELECT mr.production_order_id as po_id, SUM(public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) as cost
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = mr.production_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
        GROUP BY mr.production_order_id, mri.raw_material_id
    ) safe_mats GROUP BY po_id
)
SELECT
    po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.status, po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
    ROUND((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0)), 2) as total_actual_cost
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
LEFT JOIN material_summary ms ON po.id = ms.po_id;

-- ️ دالة حساب التكلفة المعيارية (Helper)
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN (SELECT ROUND(SUM(bom.quantity_required * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)), 4)
            FROM public.bill_of_materials bom
            JOIN public.products p ON bom.raw_material_id = p.id
            WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id);
END; $$;

-- 🛡️ تطهير الدالة القديمة لضمان عدم حدوث تعارض في مسميات البارامترات (حل خطأ 42P13)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'get_product_recipe_cost' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ️ دالة جلب تكلفة الوصفة (Helper)
-- تم تعديل التوقيع ليتوافق مع نداء الواجهة الأمامية في ملف ProductManager.tsx
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost numeric;
BEGIN
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id;
    RETURN v_cost;
END; $$;

-- 🛠️ دالة تحديث سعر البيع بناءً على التكلفة (Helper)
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prod_id uuid;
    v_cost numeric;
    v_current_price numeric;
BEGIN
    SELECT product_id INTO v_prod_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT COALESCE(weighted_average_cost, cost, 0), sales_price INTO v_cost, v_current_price 
    FROM public.products WHERE id = v_prod_id;

    -- تحديث السعر فقط إذا كان السعر الحالي 0 أو أقل من التكلفة
    IF v_current_price IS NULL OR v_current_price = 0 THEN
        UPDATE public.products SET sales_price = ROUND(v_cost * 1.20, 2) WHERE id = v_prod_id;
    END IF;
END; $$;

-- 🛡️ حذف التوقيعات القديمة لضمان عدم التعارض
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'mfg_finalize_order' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MFG Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة إغلاق أمر الإنتاج (Finalize Production) - النسخة المصححة V50.1
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed', 
    p_qc_notes text DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_accumulated_wip numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
    v_old_stock numeric; v_new_wac numeric; v_total_cost numeric := 0;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    
    v_org_id := COALESCE(v_order.organization_id, public.get_my_org());
    IF v_order.status = 'completed' THEN RETURN; END IF;

    -- جلب حسابات الربط والتحصين ضد حسابات المجموعات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10303', '103') AND organization_id = v_org_id LIMIT 1)));
    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1)));
    v_loss_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5121', '512') AND organization_id = v_org_id LIMIT 1)));

    -- 🛡️ نظام "تصفير WIP": نحسب إجمالي ما تم تحميله فعلياً (في الحساب الفرعي أو الأب) لضمان الإغلاق التام
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.related_document_id = p_order_id AND je.related_document_type = 'mfg_order';

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية (عمالة + مصاريف + خامات + طلبات صرف)
    -- أ. تكلفة العمالة المباشرة
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;

    -- ج. إضافة تكلفة المواد الفعلية المستهلكة (AMU) - تحسين الربط لضمان الدقة (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu 
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- د. إضافة تكلفة المواد المصروفة بطلبات صرف (MR) - للأصناف المستقلة فقط (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = p_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
    ), 0);


    -- 3. تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
    IF p_final_status = 'completed' AND v_order.quantity_to_produce > 0 THEN
        SELECT COALESCE(stock, 0) INTO v_old_stock FROM public.products WHERE id = v_order.product_id;
        IF (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
            v_new_wac := (((GREATEST(v_old_stock, 0) * COALESCE((SELECT weighted_average_cost FROM public.products WHERE id = v_order.product_id), 0)) + COALESCE(v_total_cost, 0)) 
                         / (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce));
            
            UPDATE public.products SET weighted_average_cost = ROUND(v_new_wac, 4), cost = ROUND(v_new_wac, 4), purchase_price = ROUND(v_new_wac, 4) WHERE id = v_order.product_id;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    IF COALESCE(v_total_cost, 0) > 0 AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        -- 🚀 استخدام v_accumulated_wip بدلاً من التقديري لضمان تصفير الحساب تماماً
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_accumulated_wip, COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 6. مديول الموارد البشرية والرواتب (HR & Payroll Module)
-- ================================================================

-- 🛠️ دالة تشغيل مسير الرواتب (Payroll Engine) - النسخة الموحدة والمصححة
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_acc uuid, 
    p_items jsonb, 
    p_org_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة للمسير.'; END IF;

    -- 🛡️ منع تكرار الصرف لنفس الفترة
    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لهذا الشهر مسبقاً.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات (مع Fallback للأكواد القياسية المصرية)
    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1));
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1));
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'إعدادات الحسابات المالية للرواتب مفقودة (531 أو 1223).';
    END IF;

    -- 🛡️ المرحلة 1: حساب الإجماليات والتحقق من النزاهة
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        -- 🚀 إصلاح Typo وحماية الـ NULL: حساب الصافي الحقيقي
        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        v_total_gross := v_total_gross + COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances;
        v_total_additions := v_total_additions + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + COALESCE((v_item->>'advances_deducted')::numeric, 0);
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + v_emp_net;
    END LOOP;

    -- 🛡️ المرحلة 2: تسجيل المسير والبنود
    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 إعادة حساب الصافي لكل موظف لضمان دقة سجل البنود (Net Salary Fix)
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
                COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances, 
                COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions, 
                COALESCE((v_item->>'payroll_tax')::numeric, 0), 
                COALESCE((v_item->>'advances_deducted')::numeric, 0), 
                COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
                v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        UPDATE public.payroll_variables SET is_processed = true WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND organization_id = v_org_id;
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances SET status = 'deducted', payroll_item_id = v_payroll_item_id WHERE employee_id = (v_item->>'employee_id')::uuid AND status = 'paid' AND organization_id = v_org_id;
        END IF;
    END LOOP;

    -- 🛡️ المرحلة 3: الترحيل المحاسبي المتوازن
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()) RETURNING id INTO v_je_id;

    IF (v_total_additions > 0 AND v_bonuses_acc_id IS NULL) OR (v_total_deductions > 0 AND v_deductions_acc_id IS NULL) OR (v_total_payroll_tax > 0 AND v_payroll_tax_id IS NULL) THEN
        RAISE EXCEPTION 'فشل ترحيل القيد: حسابات المكافآت أو الخصومات أو الضرائب غير معرّفة رغم وجود مبالغ مستحقة.';
    END IF;

    IF v_total_gross > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF ABS(COALESCE(v_total_net, 0)) > 0.001 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END; $$;

-- ================================================================
-- [تحديث] إضافة مشغل المستودعات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
        CREATE TRIGGER trg_ensure_order_warehouse BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_warehouse();
    END IF;
END $$;

-- ⚙️ مشغل فرض المنظمة آلياً عند الإضافة
-- ================================================================
-- 7. دالة محاكاة اختبار الضغط (Load Test Simulation Function)
-- ================================================================
DO $$ BEGIN
    -- 🛡️ تطهير النسخة القديمة لضمان تغيير نوع الإرجاع من TEXT إلى jsonb (HINT: 42P13)
    DROP FUNCTION IF EXISTS public.simulate_load_test(integer, integer, uuid, uuid);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'LT Purge info: %', SQLERRM; END $$;

CREATE OR REPLACE FUNCTION public.simulate_load_test(
    p_num_sales_invoices INTEGER DEFAULT 100,
    p_num_mfg_orders INTEGER DEFAULT 100,
    p_org_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
-- 🚀 تحديث V51.3: إضافة محرك قياس الأداء (Performance Benchmarking) وضمان توفر البيانات
) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id UUID;
    v_current_user_id UUID;
    v_customer_id UUID;
    v_product_id UUID;
    v_warehouse_id UUID;
    v_invoice_id UUID;
    v_mfg_product_id UUID; -- Product for manufacturing
    v_mfg_order_id UUID;
    v_i INTEGER;
    v_invoice_number TEXT;
    v_order_number TEXT;
    v_sales_price NUMERIC;
    v_cost NUMERIC;
    v_quantity NUMERIC;
    v_supplier_id UUID;
    v_treasury_acc_id UUID;
    v_mfg_routing_id UUID;
    v_mfg_progress_id UUID;
    v_employee_id UUID; -- New variable for employee ID
    v_mfg_step_id UUID;
    v_total_start timestamptz;
    v_sales_start timestamptz;
    v_mfg_start timestamptz;
    v_sales_ms float := 0;
    v_mfg_ms float := 0;
BEGIN
    v_total_start := clock_timestamp();
    -- Resolve organization and user IDs
    v_org_id := COALESCE(p_org_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));
    v_current_user_id := COALESCE(p_user_id, auth.uid(), (SELECT id FROM public.profiles WHERE organization_id = v_org_id LIMIT 1));

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID not found or provided.';
    END IF;
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID not found or provided.';
    END IF;

    -- Get or create essential IDs for operations
    SELECT id INTO v_customer_id FROM public.customers WHERE organization_id = v_org_id LIMIT 1;
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (name, organization_id) VALUES ('Load Test Customer', v_org_id) RETURNING id INTO v_customer_id;
    END IF;

    SELECT id INTO v_product_id FROM public.products WHERE organization_id = v_org_id AND product_type = 'STOCK' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (name, sales_price, cost, stock, organization_id, product_type)
        VALUES ('Load Test Product', 100, 50, 10000, v_org_id, 'STOCK') RETURNING id INTO v_product_id;
    END IF;

    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('Load Test Warehouse', v_org_id) RETURNING id INTO v_warehouse_id;
    END IF;

    SELECT id INTO v_treasury_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1;
    IF v_treasury_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231-LT', 'Load Test Cash', 'asset', v_org_id) RETURNING id INTO v_treasury_acc_id;
    END IF;

    -- Get or create an employee for MFG operations
    SELECT id INTO v_employee_id FROM public.employees WHERE organization_id = v_org_id LIMIT 1;
    IF v_employee_id IS NULL THEN
        INSERT INTO public.employees (full_name, position, organization_id, hourly_rate) VALUES ('Load Test Employee', 'Worker', v_org_id, 20) RETURNING id INTO v_employee_id;
    END IF;

    -- Find a manufactured product with a routing for MFG orders
    SELECT p.id, r.id INTO v_mfg_product_id, v_mfg_routing_id
    FROM public.products p
    JOIN public.mfg_routings r ON p.id = r.product_id
    WHERE p.organization_id = v_org_id AND p.mfg_type = 'standard'
    LIMIT 1;

    IF v_mfg_product_id IS NULL THEN
        -- 🛠️ ترميم بيانات الاختبار (Self-Healing): إنشاء منتج ومسار إذا لم يوجدا لضمان اختبار التصنيع
        RAISE NOTICE 'No manufactured product found. Creating test data for organization %...', v_org_id;
        
        INSERT INTO public.products (name, mfg_type, product_type, sales_price, cost, weighted_average_cost, organization_id)
        VALUES ('منتج اختبار الضغط', 'standard', 'MANUFACTURED', 100, 50, 50, v_org_id) RETURNING id INTO v_mfg_product_id;
        
        INSERT INTO public.mfg_routings (product_id, name, organization_id, is_default)
        VALUES (v_mfg_product_id, 'مسار اختبار الضغط', v_org_id, true) RETURNING id INTO v_mfg_routing_id;
        
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
        VALUES (v_mfg_routing_id, 1, 
               (SELECT id FROM public.mfg_work_centers WHERE organization_id = v_org_id LIMIT 1), 
               'تجميع آلي', 60, v_org_id);
               
        -- تأكيد وجود خامة لربطها بالمسار
        SELECT id INTO v_product_id FROM public.products WHERE organization_id = v_org_id AND mfg_type = 'raw' LIMIT 1;
        IF v_product_id IS NOT NULL THEN
            INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
            VALUES ((SELECT id FROM public.mfg_routing_steps WHERE routing_id = v_mfg_routing_id LIMIT 1), v_product_id, 1, v_org_id);
        END IF;
    END IF;

    -- ============================================================
    -- Simulate Sales Invoices
    -- ============================================================
    RAISE NOTICE 'Simulating % sales invoices...', p_num_sales_invoices;
    v_sales_start := clock_timestamp();
    FOR v_i IN 1..p_num_sales_invoices LOOP
        v_invoice_number := 'LT-INV-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4)) || '-' || LPAD(v_i::text, 4, '0');
        v_sales_price := (RANDOM() * 100 + 50)::NUMERIC(10,2); -- Random price between 50 and 150
        v_quantity := (RANDOM() * 5 + 1)::NUMERIC(10,2); -- Random quantity between 1 and 6

        INSERT INTO public.invoices (
            invoice_number, customer_id, invoice_date, total_amount, tax_amount, subtotal,
            status, warehouse_id, organization_id, created_by
        ) VALUES (
            v_invoice_number, v_customer_id, now()::date, v_sales_price * v_quantity * 1.14, v_sales_price * v_quantity * 0.14, v_sales_price * v_quantity,
            'draft', v_warehouse_id, v_org_id, v_current_user_id
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO public.invoice_items (
            invoice_id, product_id, quantity, unit_price, organization_id
        ) VALUES (
            v_invoice_id, v_product_id, v_quantity, v_sales_price, v_org_id
        );

        -- Approve the invoice to trigger stock and journal entries
        PERFORM public.approve_invoice(v_invoice_id, v_org_id, v_warehouse_id);
    END LOOP;
    PERFORM public.recalculate_stock_rpc(v_org_id); -- تحديث نهائي لضمان الدقة
    v_sales_ms := extract(epoch from (clock_timestamp() - v_sales_start)) * 1000;
    RAISE NOTICE 'Finished simulating % sales invoices.', p_num_sales_invoices;

    -- ============================================================
    -- Simulate Manufacturing Orders
    -- ============================================================
    IF p_num_mfg_orders > 0 THEN
        RAISE NOTICE 'Simulating % manufacturing orders...', p_num_mfg_orders;
        v_mfg_start := clock_timestamp();
        FOR v_i IN 1..p_num_mfg_orders LOOP
            v_order_number := 'LT-MFG-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4)) || '-' || LPAD(v_i::text, 4, '0');
            v_quantity := (RANDOM() * 10 + 1)::NUMERIC(10,2); -- Random quantity between 1 and 11

            INSERT INTO public.mfg_production_orders (
                order_number, product_id, quantity_to_produce, status, warehouse_id, organization_id
            ) VALUES (
                v_order_number, v_mfg_product_id, v_quantity, 'draft', v_warehouse_id, v_org_id
            ) RETURNING id INTO v_mfg_order_id;

            -- Start the production order (this will create steps)
            PERFORM public.mfg_start_production_order(v_mfg_order_id);

            -- Complete all steps for the order
            FOR v_mfg_progress_id IN SELECT id FROM public.mfg_order_progress WHERE production_order_id = v_mfg_order_id LOOP
                PERFORM public.mfg_start_step(v_mfg_progress_id, v_employee_id); -- Use the actual employee ID
                PERFORM public.mfg_complete_step(v_mfg_progress_id, v_quantity); -- Assuming each step produces the full quantity
            END LOOP;

            -- Finalize the manufacturing order
            PERFORM public.mfg_finalize_order(v_mfg_order_id, 'completed', 'Load test completion');
        END LOOP;
        PERFORM public.recalculate_stock_rpc(v_org_id); -- تحديث نهائي
        v_mfg_ms := extract(epoch from (clock_timestamp() - v_mfg_start)) * 1000;
        RAISE NOTICE 'Finished simulating % manufacturing orders.', p_num_mfg_orders;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'organization_id', v_org_id,
        'benchmarks', jsonb_build_object(
            'sales_invoices', jsonb_build_object('count', p_num_sales_invoices, 'total_ms', ROUND(v_sales_ms::numeric, 2), 'avg_ms_per_op', ROUND((v_sales_ms / NULLIF(p_num_sales_invoices, 0))::numeric, 2)),
            'mfg_orders', jsonb_build_object('count', p_num_mfg_orders, 'total_ms', ROUND(v_mfg_ms::numeric, 2), 'avg_ms_per_op', ROUND((v_mfg_ms / NULLIF(p_num_mfg_orders, 0))::numeric, 2)),
            'total_execution_ms', ROUND((extract(epoch from (clock_timestamp() - v_total_start)) * 1000)::numeric, 2)
        ),
        'timestamp', now()
    );

EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
    VALUES (SQLERRM, jsonb_build_object('p_invoices', p_num_sales_invoices, 'p_mfg', p_num_mfg_orders), 'simulate_load_test', v_org_id);
    RAISE EXCEPTION 'خطأ في اختبار الضغط: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulate_load_test(INTEGER, INTEGER, UUID, UUID) TO authenticated;
-- ================================================================
-- 8. دالة تنظيف بيانات اختبار الضغط (Load Test Data Cleanup)
-- ================================================================
CREATE OR REPLACE FUNCTION public.clean_load_test_data(p_org_id UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    v_final_org_id := COALESCE(p_org_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));

    IF v_final_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID not found or provided.';
    END IF;

    RAISE NOTICE 'Cleaning load test data for organization %...', v_final_org_id;

    -- 1. حذف سجلات الجداول الفرعية أولاً بسبب قيود المفتاح الأجنبي (FK constraints)

    -- حذف من mfg_actual_material_usage
    DELETE FROM public.mfg_actual_material_usage
    WHERE organization_id = v_final_org_id
    AND order_progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_actual_material_usage.', v_deleted_count;

    -- حذف من mfg_scrap_logs
    DELETE FROM public.mfg_scrap_logs
    WHERE organization_id = v_final_org_id
    AND order_progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_scrap_logs.', v_deleted_count;

    -- حذف من mfg_qc_inspections
    DELETE FROM public.mfg_qc_inspections
    WHERE organization_id = v_final_org_id
    AND progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_qc_inspections.', v_deleted_count;

    -- حذف من mfg_batch_serials
    DELETE FROM public.mfg_batch_serials
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_batch_serials.', v_deleted_count;

    -- حذف من mfg_production_variances
    DELETE FROM public.mfg_production_variances
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_production_variances.', v_deleted_count;

    -- حذف من mfg_material_request_items
    DELETE FROM public.mfg_material_request_items
    WHERE organization_id = v_final_org_id
    AND material_request_id IN (
        SELECT id FROM public.mfg_material_requests
        WHERE organization_id = v_final_org_id AND production_order_id IN (
            SELECT id FROM public.mfg_production_orders
            WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_material_request_items.', v_deleted_count;

    -- حذف من mfg_material_requests
    DELETE FROM public.mfg_material_requests
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_material_requests.', v_deleted_count;

    -- حذف من mfg_order_progress
    DELETE FROM public.mfg_order_progress
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_order_progress.', v_deleted_count;

    -- حذف من invoice_items
    DELETE FROM public.invoice_items
    WHERE organization_id = v_final_org_id
    AND invoice_id IN (
        SELECT id FROM public.invoices
        WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from invoice_items.', v_deleted_count;

    -- حذف من journal_lines المرتبطة بفواتير وأوامر تصنيع اختبار الضغط
    DELETE FROM public.journal_lines
    WHERE organization_id = v_final_org_id
    AND journal_entry_id IN (
        SELECT je.id FROM public.journal_entries je
        WHERE je.organization_id = v_final_org_id
        AND (
            (je.related_document_type = 'invoice' AND je.related_document_id IN (SELECT id FROM public.invoices WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'))
            OR
            (je.related_document_type = 'mfg_order' AND je.related_document_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'))
            OR
            (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT op.id FROM public.mfg_order_progress op JOIN public.mfg_production_orders po ON op.production_order_id = po.id WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'))
            OR
            (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE organization_id = v_final_org_id AND production_order_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%')) )
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from journal_lines.', v_deleted_count;

    -- حذف من journal_entries المرتبطة بفواتير وأوامر تصنيع اختبار الضغط
    DELETE FROM public.journal_entries
    WHERE organization_id = v_final_org_id
    AND (
        (related_document_type = 'invoice' AND related_document_id IN (SELECT id FROM public.invoices WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'))
        OR
        (related_document_type = 'mfg_order' AND related_document_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'))
        OR
        (related_document_type = 'mfg_step' AND related_document_id IN (SELECT op.id FROM public.mfg_order_progress op JOIN public.mfg_production_orders po ON op.production_order_id = po.id WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'))
        OR
        (related_document_type = 'mfg_material_request' AND related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE organization_id = v_final_org_id AND production_order_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%')) )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from journal_entries.', v_deleted_count;

    -- 2. حذف السجلات الرئيسية

    -- حذف من invoices
    DELETE FROM public.invoices
    WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from invoices.', v_deleted_count;

    -- حذف من mfg_production_orders
    DELETE FROM public.mfg_production_orders
    WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_production_orders.', v_deleted_count;

    -- حذف من opening_inventories للمنتجات التي تم إنشاؤها لاختبار الضغط
    DELETE FROM public.opening_inventories
    WHERE organization_id = v_final_org_id
    AND product_id IN (
        SELECT id FROM public.products
        WHERE organization_id = v_final_org_id AND name IN ('Load Test Product', 'خامة افتراضية للتصنيع', 'منتج مصنع افتراضي')
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from opening_inventories.', v_deleted_count;

    -- حذف من mfg_routing_steps
    DELETE FROM public.mfg_routing_steps
    WHERE organization_id = v_final_org_id
    AND routing_id IN (
        SELECT id FROM public.mfg_routings
        WHERE organization_id = v_final_org_id AND product_id IN (
            SELECT id FROM public.products WHERE organization_id = v_final_org_id AND name = 'منتج مصنع افتراضي'
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_routing_steps.', v_deleted_count;

    -- حذف من mfg_routings
    DELETE FROM public.mfg_routings
    WHERE organization_id = v_final_org_id
    AND product_id IN (
        SELECT id FROM public.products WHERE organization_id = v_final_org_id AND name = 'منتج مصنع افتراضي'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_routings.', v_deleted_count;

    -- حذف من products
    DELETE FROM public.products
    WHERE organization_id = v_final_org_id AND name IN ('Load Test Product', 'خامة افتراضية للتصنيع', 'منتج مصنع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from products.', v_deleted_count;

    -- حذف من customers
    DELETE FROM public.customers
    WHERE organization_id = v_final_org_id AND name = 'Load Test Customer';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from customers.', v_deleted_count;

    -- حذف من employees
    DELETE FROM public.employees
    WHERE organization_id = v_final_org_id AND full_name IN ('Load Test Employee', 'موظف تصنيع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from employees.', v_deleted_count;

    -- حذف من mfg_work_centers
    DELETE FROM public.mfg_work_centers
    WHERE organization_id = v_final_org_id AND name = 'مركز عمل افتراضي';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_work_centers.', v_deleted_count;

    -- حذف من warehouses
    DELETE FROM public.warehouses
    WHERE organization_id = v_final_org_id AND name IN ('Load Test Warehouse', 'مستودع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from warehouses.', v_deleted_count;

    -- حذف من accounts (فقط الحساب المحدد الذي تم إنشاؤه لاختبار الضغط)
    DELETE FROM public.accounts
    WHERE organization_id = v_final_org_id AND code = '1231-LT';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from accounts.', v_deleted_count;

    -- إعادة احتساب المخزون بعد التنظيف لضمان دقة الأرصدة
    PERFORM public.recalculate_stock_rpc(v_final_org_id);

    RETURN 'Load test data cleanup completed for organization ' || v_final_org_id || '.';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Load test data cleanup failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_load_test_data(UUID) TO authenticated;

-- ================================================================
-- 🔓 منح الصلاحيات النهائية (Final Grants)
-- ================================================================
-- 🛡️ [V51.0] رادار نزاهة النظام الشامل (Global ERP Health Monitor)
-- الغرض: التأكد من أن النظام متماسك برمجياً ومحاسبياً 100%
-- 🛡️ [V51.1] رادار نزاهة النظام المطور (Enhanced Reliability Radar)
DROP VIEW IF EXISTS public.v_global_system_health CASCADE;
CREATE OR REPLACE VIEW public.v_global_system_health AS
WITH stats AS (
    SELECT 
        (SELECT COUNT(*) FROM public.journal_entries) as total_je,
        (SELECT COUNT(*) FROM (SELECT journal_entry_id FROM public.journal_lines GROUP BY journal_entry_id HAVING ABS(SUM(debit - credit)) > 0.01) t) as unbalanced,
        (SELECT COUNT(*) FROM public.products) as total_products,
        (SELECT COUNT(*) FROM public.products WHERE stock < 0) as neg_stock,
        (SELECT COUNT(*) FROM public.journal_lines) as total_lines,
        (SELECT COUNT(*) FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries)) as orphans
)
SELECT 
    (SELECT COUNT(*) FROM public.organizations) as total_companies,
    (SELECT COUNT(*) FROM public.profiles WHERE is_active = true) as active_users,
    unbalanced as unbalanced_vouchers_count,
    neg_stock as negative_stock_items,
    orphans as orphaned_ledger_lines,
    total_je as total_financial_transactions,
    (SELECT COUNT(*) FROM public.invoices) + (SELECT COUNT(*) FROM public.orders) as total_sales_documents,
    -- 🏆 مؤشر موثوقية النظام (أهم رقم للتسويق)
    CASE 
        WHEN total_je = 0 AND orphans = 0 AND neg_stock = 0 THEN 100.00
        WHEN total_je = 0 AND (orphans > 0 OR neg_stock > 0) THEN 0.00
        ELSE ROUND(GREATEST(0, 100 - (
            COALESCE(unbalanced::numeric / NULLIF(total_je, 0) * 100 * 0.6, 0) + 
            COALESCE(orphans::numeric / NULLIF(total_lines, 0) * 100 * 0.3, 0) + 
            COALESCE(neg_stock::numeric / NULLIF(total_products, 0) * 100 * 0.1, 0)
        )), 2)
    END as reliability_score,
    now() as last_check_at
FROM stats;

-- 🛡️ [V51.2] حارس التوازن الصارم (Strict Balance Guard)
-- المهمة: منع ترحيل أي قيد غير متزن لحظياً (Real-time Prevention)
CREATE OR REPLACE FUNCTION public.fn_guard_journal_balance()
RETURNS TRIGGER AS $$
DECLARE v_diff numeric;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN RETURN NEW; END IF;
    IF NEW.status = 'posted' THEN
        SELECT SUM(debit - credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = NEW.id;
        IF ABS(COALESCE(v_diff, 0)) > 0.01 THEN
            RAISE EXCEPTION '⚠️ خرق مالي: لا يمكن ترحيل قيد غير متزن (الفرق: %). تم تفعيل درع الحماية.', v_diff;
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_balance_guard ON public.journal_entries;
CREATE TRIGGER trg_journal_balance_guard
AFTER UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_journal_balance();

GRANT SELECT ON public.v_global_system_health TO authenticated;

-- 📊 دالة جلب إحصائيات لوحة التحكم (Dashboard Stats RPC)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid;
    v_current_month_start date := date_trunc('month', now())::date;
    v_current_month_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
    v_prev_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
    v_prev_month_end date := (date_trunc('month', now()) - interval '1 day')::date;
    
    v_month_sales numeric := 0;
    v_prev_month_sales numeric := 0;
    v_month_purchases numeric := 0;
    v_prev_month_purchases numeric := 0;
    v_month_cogs numeric := 0;
    v_month_expenses numeric := 0;
    v_receivables numeric := 0;
    v_payables numeric := 0;
    v_total_receipts numeric := 0;
    v_total_payments numeric := 0;
    v_reliability_score numeric := 0; -- 🛡️ جديد: مؤشر نزاهة البيانات
    v_low_stock_count bigint := 0;
    v_sales_target numeric := 0;
    
    -- مقاييس المقاولات الجديدة
    v_active_projects_count bigint := 0;
    v_total_contracts_value numeric := 0;
    v_total_construction_billed numeric := 0;
    
    v_chart_data jsonb := '[]'::jsonb;
    v_recent_invoices jsonb := '[]'::jsonb;
    v_recent_journals jsonb := '[]'::jsonb;
    v_top_customers jsonb := '[]'::jsonb;
    v_top_products jsonb := '[]'::jsonb;
    v_top_customers_pie_data jsonb := '[]'::jsonb;
    v_low_stock_items jsonb := '[]'::jsonb;
    v_mappings jsonb;
    v_sales_acc_id uuid;
    v_cogs_acc_id uuid;
    v_expense_acc_ids uuid[];
    v_customer_acc_id uuid;
    v_supplier_acc_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    IF v_target_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID is required.';
    END IF;

    -- Get account mappings and sales target
    SELECT account_mappings, monthly_sales_target INTO v_mappings, v_sales_target
    FROM public.company_settings
    WHERE organization_id = v_target_org_id;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_target_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_target_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_target_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_target_org_id LIMIT 1));
    
    -- جلب درجة الموثوقية من الرادار
    SELECT reliability_score INTO v_reliability_score FROM public.v_global_system_health;

    -- 1. Current Month Sales (Net Revenue from GL to match Income Statement)
    -- 🛡️ [إصلاح] استخدام ميزان المراجعة للحصول على صافي الإيرادات (بعد المرتجعات) بدلاً من إجمالي الفواتير
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.code LIKE '4%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 2. Previous Month Sales (Net Revenue)
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_prev_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.code LIKE '4%')
    AND je.transaction_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 3. Current Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 4. Previous Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 5. Current Month COGS (Net Cost from GL)
    -- 🛡️ [تحسين] استخدام نفس منطق قائمة الدخل لضمان تطابق الأرقام
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_cogs
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.id = v_cogs_acc_id OR a.code LIKE '511%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%cost%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 6. Current Month Operating Expenses (from journal entries)
    -- 🛡️ [إصلاح حاسم] استبعاد حسابات تكلفة المبيعات من المصروفات الإدارية لمنع تكرار الخصم وظهور أرباح سالبة خاطئة
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_expenses
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%expense%' OR a.code LIKE '5%')
    AND NOT (a.id = v_cogs_acc_id OR a.code LIKE '511%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%cost%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 7. Receivables (Customers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables
    FROM public.customers
    WHERE organization_id = v_target_org_id;

    -- 8. Payables (Suppliers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_payables
    FROM public.suppliers
    WHERE organization_id = v_target_org_id;

    -- 9. Total Receipts (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_receipts
    FROM public.receipt_vouchers
    WHERE organization_id = v_target_org_id
    AND receipt_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 10. Total Payments (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_payments
    FROM public.payment_vouchers
    WHERE organization_id = v_target_org_id
    AND payment_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 🏗️ إحصائيات المقاولات (Construction KPIs)
    SELECT COUNT(*) INTO v_active_projects_count 
    FROM public.projects WHERE organization_id = v_target_org_id AND status = 'active';
    
    SELECT COALESCE(SUM(contract_value), 0) INTO v_total_contracts_value 
    FROM public.projects WHERE organization_id = v_target_org_id AND status != 'cancelled';

    SELECT COALESCE(SUM(gross_amount), 0) INTO v_total_construction_billed 
    FROM public.project_progress_billings 
    WHERE organization_id = v_target_org_id AND status = 'approved';

    -- 11. Low Stock Count and Items
    SELECT COUNT(*) INTO v_low_stock_count
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock, 'min_stock_level', min_stock_level, 'sku', sku)), '[]'::jsonb)
    INTO v_low_stock_items
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0
    LIMIT 5;

    -- 12. Chart Data (Last 6 months sales/purchases)
    WITH monthly_sales_summary AS (
        SELECT
            to_char(date_trunc('month', inv.invoice_date), 'YYYY-MM') as month_key,
            to_char(date_trunc('month', inv.invoice_date), 'Mon') as month_name,
            COALESCE(SUM(inv.total_amount), 0) as sales_amount
        FROM public.invoices inv
        WHERE inv.organization_id = v_target_org_id AND inv.status IN ('posted', 'paid')
        AND inv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1, 2
    ),
    monthly_purchase_summary AS (
        SELECT
            to_char(date_trunc('month', pinv.invoice_date), 'YYYY-MM') as month_key,
            COALESCE(SUM(pinv.total_amount), 0) as purchase_amount
        FROM public.purchase_invoices pinv
        WHERE pinv.organization_id = v_target_org_id AND pinv.status IN ('posted', 'paid')
        AND pinv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
        'name', ms.month_name,
        'sales', ms.sales_amount,
        'purchases', COALESCE(mps.purchase_amount, 0)
    ) ORDER BY ms.month_key)
    INTO v_chart_data
    FROM monthly_sales_summary ms
    LEFT JOIN monthly_purchase_summary mps ON ms.month_key = mps.month_key;

    -- 13. Recent Invoices
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_invoices
    FROM (
        SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, c.name as customer_name
        FROM public.invoices i
        LEFT JOIN public.customers c ON i.customer_id = c.id
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        ORDER BY i.invoice_date DESC
        LIMIT 5
    ) t;

    -- 14. Recent Journals (top 5)
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_journals
    FROM (
        SELECT je.id, je.transaction_date, je.description, je.reference
        FROM public.journal_entries je
        WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
        ORDER BY je.transaction_date DESC
        LIMIT 5
    ) t;

    -- 15. Top Customers
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total_sales)), '[]'::jsonb)
    INTO v_top_customers
    FROM customer_sales;

    -- 16. Top Customers Pie Data (for pie chart)
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 4 -- Top 4, rest will be 'Others'
    ),
    other_sales AS (
        SELECT COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.invoices i
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        AND i.customer_id NOT IN (SELECT id FROM customer_sales)
    )
    SELECT jsonb_agg(jsonb_build_object('name', name, 'value', total_sales)) ||
           CASE WHEN (SELECT total_sales FROM other_sales) > 0 THEN jsonb_build_array(jsonb_build_object('name', 'عملاء آخرون', 'value', (SELECT total_sales FROM other_sales))) ELSE '[]'::jsonb END
    INTO v_top_customers_pie_data
    FROM customer_sales;

    -- 17. Top Products
    WITH product_revenue AS (
        SELECT p.id, p.name, COALESCE(SUM(ii.quantity * ii.unit_price), 0) as total_revenue
        FROM public.products p
        JOIN public.invoice_items ii ON p.id = ii.product_id
        JOIN public.invoices i ON ii.invoice_id = i.id
        WHERE p.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total_revenue', total_revenue)), '[]'::jsonb)
    INTO v_top_products
    FROM product_revenue;


    RETURN jsonb_build_object(
        'monthSales', v_month_sales,
        'prevMonthSales', v_prev_month_sales,
        'monthPurchases', v_month_purchases,
        'prevMonthPurchases', v_prev_month_purchases,
        'monthCogs', v_month_cogs,
        'monthExpenses', v_month_expenses,
        'receivables', v_receivables,
        'payables', v_payables,
        'totalReceipts', v_total_receipts,
        'totalPayments', v_total_payments,
        'lowStockCount', v_low_stock_count,
        'systemReliability', v_reliability_score, -- 🏆 جاهزة للعرض في الـ UI
        'salesTarget', COALESCE(v_sales_target, 0),
        'activeProjectsCount', v_active_projects_count,
        'totalContractsValue', v_total_contracts_value,
        'totalConstructionBilled', v_total_construction_billed,
        'chartData', v_chart_data,
        'recentInvoices', v_recent_invoices,
        'recentJournals', v_recent_journals,
        'topCustomers', v_top_customers,
        'topProducts', v_top_products,
        'topCustomersPieData', v_top_customers_pie_data,
        'lowStockItems', v_low_stock_items
    );
END;
$$;
-- 🛠️ دالة إقفال السنة المالية (Fiscal Year Closing Engine)
-- الوصف: تصفير حسابات قائمة الدخل (إيرادات ومصروفات) وترحيل الصافي إلى الأرباح المبقاة (32)
CREATE OR REPLACE FUNCTION public.close_financial_year(
    p_year integer,
    p_closing_date date,
    p_org_id uuid DEFAULT public.get_my_org()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_net_income numeric := 0;
    v_je_id uuid;
    v_retained_earnings_acc_id uuid;
    v_row record;
    v_ref text := 'CLOSE-' || p_year;
    v_target_org uuid := COALESCE(p_org_id, public.get_my_org());
    v_entry_count integer := 0;
BEGIN
    -- 1. التحقق من وجود حساب الأرباح المبقاة (32)
    SELECT id INTO v_retained_earnings_acc_id FROM public.accounts WHERE organization_id = v_target_org AND code = '32' LIMIT 1;
    IF v_retained_earnings_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المبقاة (32) مفقود في دليل الحسابات.'; END IF;

    -- 2. منع التكرار
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_target_org) THEN
        RAISE EXCEPTION 'السنة المالية % مغلقة بالفعل لهذه الشركة.', p_year;
    END IF;

    -- 3. إنشاء رأس قيد الإقفال
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, user_id)
    VALUES (p_closing_date, 'إقفال حسابات النتيجة للسنة المالية ' || p_year, v_ref, 'posted', v_target_org, true, auth.uid())
    RETURNING id INTO v_je_id;

    -- 4. حصر وإقفال الحسابات المؤقتة (إيرادات ومصروفات مرحلة فقط)
    FOR v_row IN 
        SELECT a.id, a.name, SUM(jl.debit - jl.credit) as balance
        FROM public.accounts a
        JOIN public.journal_lines jl ON a.id = jl.account_id
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted'
          AND EXTRACT(YEAR FROM je.transaction_date) = p_year
          AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%expense%' OR a.code LIKE '4%' OR a.code LIKE '5%')
        GROUP BY a.id, a.name
        HAVING ABS(SUM(jl.debit - jl.credit)) > 0.001
    LOOP
        -- إقفال: عكس الرصيد الحالي (المدين يصبح دائن والعكس)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_row.id, CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END, CASE WHEN v_row.balance > 0 THEN v_row.balance ELSE 0 END, 'إقفال رصيد حساب ' || v_row.name, v_target_org);
        v_net_income := v_net_income + (-v_row.balance);
        v_entry_count := v_entry_count + 1;
    END LOOP;

    IF v_entry_count = 0 THEN
        DELETE FROM public.journal_entries WHERE id = v_je_id;
        RAISE EXCEPTION 'لا توجد حركات مرحلة في سنة % تتطلب الإقفال.', p_year;
    END IF;

    -- 5. ترحيل صافي الأرباح/الخسائر (v_net_income دائن للربح ومدين للخسارة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_retained_earnings_acc_id, CASE WHEN v_net_income < 0 THEN ABS(v_net_income) ELSE 0 END, CASE WHEN v_net_income > 0 THEN v_net_income ELSE 0 END, 'ترحيل صافي نتيجة نشاط سنة ' || p_year, v_target_org);

    -- 6. موازنة القيد النهائية
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    
    -- 7. تحديث إعدادات الإغلاق
    UPDATE public.company_settings SET last_closed_year = p_year, last_closed_date = p_closing_date WHERE organization_id = v_target_org;

    RETURN '✅ تم بنجاح إقفال السنة ' || p_year || ' وترحيل الصافي لحساب الأرباح المبقاة.';
END; $$;

-- 🔓 دالة إعادة فتح سنة مالية مغلقة (Reopen Fiscal Year)
-- الوصف: حذف قيد الإغلاق وتعديل إعدادات السنة المغلقة للسماح بالتعديلات المؤقتة
CREATE OR REPLACE FUNCTION public.reopen_financial_year(
    p_year integer,
    p_org_id uuid DEFAULT public.get_my_org()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_target_org uuid := COALESCE(p_org_id, public.get_my_org());
    v_last_closed integer;
    v_ref text := 'CLOSE-' || p_year;
BEGIN
    -- 1. التأكد من أن السنة المطلوب فتحها هي آخر سنة مغلقة (لأن الإغلاق تراكمي)
    SELECT last_closed_year INTO v_last_closed FROM public.company_settings WHERE organization_id = v_target_org;

    IF v_last_closed IS NULL OR v_last_closed < p_year THEN
        RETURN '⚠️ هذه السنة ليست مغلقة حالياً في إعدادات المنظمة.';
    END IF;

    IF v_last_closed > p_year THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: يجب إعادة فتح السنة % أولاً قبل فتح سنة % لضمان تسلسل الأرصدة.', v_last_closed, p_year;
    END IF;

    -- 2. تفعيل وضع التجاوز لحذف قيد الإغلاق وتحديث الإعدادات
    PERFORM set_config('app.restore_mode', 'on', true);
    
    DELETE FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_target_org;
    UPDATE public.company_settings SET last_closed_year = p_year - 1, last_closed_date = (make_date(p_year - 1, 12, 31)) WHERE organization_id = v_target_org;
    
    PERFORM set_config('app.restore_mode', 'off', true);

    RETURN '🔓 تم فتح السنة المالية ' || p_year || ' بنجاح. يمكنك الآن تعديل الحركات. تذكر إعادة الإغلاق فور الانتهاء.';
END; $$;

-- 🛡️ درع حماية السنوات المغلقة (Prevention Trigger)
CREATE OR REPLACE FUNCTION public.fn_check_closed_year() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = NEW.organization_id AND last_closed_year >= EXTRACT(YEAR FROM NEW.transaction_date)) THEN
        RAISE EXCEPTION '⚠️ خطأ حماية: لا يمكن إضافة أو تعديل بيانات في سنة مالية مغلقة مسبقاً.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_closed_year ON public.journal_entries;
CREATE TRIGGER trg_check_closed_year BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.fn_check_closed_year();

-- 🛠️ دالة تنظيف السجلات المحذوفة نهائياً (Database Purge Engine)
-- الوصف: حذف السجلات التي تم تعليمها للحذف (Soft Deleted) وتنظيف البيانات اليتيمة
DROP FUNCTION IF EXISTS public.purge_deleted_records();
CREATE OR REPLACE FUNCTION public.purge_deleted_records()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table text;
    v_count bigint;
    v_total_purged bigint := 0;
    v_tables_processed text[] := ARRAY[]::text[];
BEGIN
    -- 1. البحث عن كافة الجداول التي تحتوي على خاصية "الحذف الناعم" وتطهيرها
    FOR v_table IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'deleted_at'
          AND table_name NOT IN ('spatial_ref_sys')
    LOOP
        EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL', v_table);
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total_purged := v_total_purged + v_count;
        IF v_count > 0 THEN
            v_tables_processed := array_append(v_tables_processed, v_table);
        END IF;
    END LOOP;

    -- 2. تنظيف البيانات اليتيمة لضمان سلامة التكامل المرجعي
    DELETE FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);
    DELETE FROM public.invoice_items WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
    DELETE FROM public.order_items WHERE order_id NOT IN (SELECT id FROM public.orders);
    DELETE FROM public.order_item_modifiers WHERE order_item_id NOT IN (SELECT id FROM public.order_items);

    RETURN format('✅ تم تنظيف قاعدة البيانات بنجاح. إجمالي السجلات المطهرة: %s. الجداول المتأثرة: %s', v_total_purged, array_to_string(v_tables_processed, ', '));
END; $$;

-- 🛠️ دالة إصلاح مخطط المرتجعات (Fix Returns Schema)
-- الوصف: توحيد مسميات أعمدة المرتجعات لضمان التوافق
-- ملاحظة: تم تغيير نوع الإرجاع إلى TEXT لحل مشكلة الـ Rendering في React
DROP FUNCTION IF EXISTS public.fix_returns_schema();
CREATE OR REPLACE FUNCTION public.fix_returns_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['quotation_items', 'sales_return_items', 'purchase_invoice_items', 'purchase_order_items', 'purchase_return_items', 'invoice_items', 'order_items', 'modifiers'];
    v_log_message text := '';
    v_count int := 0;
BEGIN
    -- توحيد مسمى سعر الوحدة في جميع جداول النظام
    FOREACH t IN ARRAY tables_to_fix LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE') 
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'price') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'unit_price') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN price TO unit_price', t);
                v_log_message := v_log_message || format('Renamed price to unit_price in %s. ', t);
                v_count := v_count + 1;
            ELSE
                -- إذا كان كلاهما موجوداً، انقل البيانات للعمود الجديد واحذف القديم لتجنب التعارض
                EXECUTE format('UPDATE public.%I SET unit_price = COALESCE(price, 0) WHERE unit_price IS NULL OR unit_price = 0', t);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN price', t);
                v_log_message := v_log_message || format('Merged price into unit_price and dropped price column in %s. ', t);
                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- ضمان عدم تكرار التصنيفات
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_categories_name_org_unique') THEN
        -- Check if organization_id column exists before adding constraint
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'organization_id') THEN
            ALTER TABLE public.item_categories ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'display_order') THEN
            ALTER TABLE public.item_categories ADD COLUMN display_order integer DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'created_at') THEN
            ALTER TABLE public.item_categories ADD COLUMN created_at timestamptz DEFAULT now();
        END IF;
        ALTER TABLE public.item_categories ADD CONSTRAINT item_categories_name_org_unique UNIQUE (organization_id, name);
        v_log_message := v_log_message || 'Added unique constraint to item_categories. ';
        v_count := v_count + 1;
    END IF;

    -- توحيد مسميات معرفات المرتجعات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            EXECUTE 'ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id';
            v_log_message := v_log_message || 'Renamed return_id to sales_return_id in sales_return_items. ';
            v_count := v_count + 1;
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            EXECUTE 'ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id';
            v_log_message := v_log_message || 'Renamed return_id to purchase_return_id in purchase_return_items. ';
            v_count := v_count + 1;
        END IF;
    END IF;

    RETURN format('✅ تم إصلاح مخطط المرتجعات بنجاح. التغييرات المنفذة: %s. التفاصيل: %s', v_count, v_log_message);

END; $$;

-- 🛠️ دالة فحص وإنشاء الحسابات الأساسية المفقودة (Create Missing System Accounts)
-- الوصف: تضمن وجود الحسابات الأساسية الضرورية لعمل النظام والتقارير المحاسبية.
CREATE OR REPLACE FUNCTION public.create_missing_system_accounts(p_org_id uuid DEFAULT public.get_my_org())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_created_count integer := 0;
    v_account_item record;
    v_parent_id uuid;
BEGIN
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف المنظمة غير موجود.';
    END IF;

    -- Define essential accounts using a temporary table, similar to initialize_egyptian_coa
    CREATE TEMPORARY TABLE IF NOT EXISTS coa_missing_temp (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    -- Clear previous data in case of multiple calls within a session
    TRUNCATE TABLE coa_missing_temp;

    INSERT INTO coa_missing_temp (code, name, type, is_group, parent_code) VALUES
        ('1', 'الأصول', 'asset', true, NULL),
        ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL),
        ('3', 'حقوق الملكية', 'equity', true, NULL),
        ('4', 'الإيرادات', 'revenue', true, NULL),
        ('5', 'المصروفات', 'expense', true, NULL),
        ('11', 'الأصول غير المتداولة', 'asset', true, '1'),
        ('12', 'الأصول المتداولة', 'asset', true, '1'),
        ('111', 'الأصول الثابتة', 'asset', true, '11'),
        ('103', 'المخزون', 'asset', true, '12'),
        ('122', 'العملاء والمدينون', 'asset', true, '12'),
        ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
        ('22', 'الخصوم المتداولة', 'liability', true, '2'),
        ('10301', 'مخزون المواد الخام', 'asset', false, '103'),
        ('10302', 'مخزون المنتج التام', 'asset', false, '103'),
        ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
        ('1221', 'العملاء', 'asset', false, '122'),
        ('122101', 'ذمم شركات التأمين الطبي', 'asset', false, '122'),
        ('1231', 'النقدية بالصندوق', 'asset', false, '123'),
        ('201', 'الموردين', 'liability', false, '22'),
        ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
        ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'),
        ('411', 'إيراد المبيعات', 'revenue', false, '41'),
        ('41101', 'إيرادات تشغيل وخدمات متنوعة', 'revenue', false, '41'),
        ('42', 'إيرادات أخرى', 'revenue', true, '4'),
        ('425', 'إيراد تشغيل معدات داخلي', 'revenue', false, '42'),
        ('511', 'تكلفة البضاعة المباعة', 'expense', false, '5'),
        ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
        ('541', 'تسوية عجز الصندوق', 'expense', false, '53');

    -- Insert missing accounts from the temporary table
    FOR v_account_item IN SELECT * FROM coa_missing_temp ORDER BY length(code), code
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org_id AND code = v_account_item.code) THEN
            v_parent_id := NULL;
            IF v_account_item.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org_id AND code = v_account_item.parent_code;
            END IF;

            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org_id, v_account_item.code, v_account_item.name, v_account_item.type, v_account_item.is_group, v_parent_id, true);
            v_created_count := v_created_count + 1;
        END IF;
    END LOOP;

    RETURN format('✅ تم إنشاء %s حساب أساسي مفقود بنجاح.', v_created_count);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'فشل إنشاء الحسابات المفقودة: %', SQLERRM;
END; $$;

GRANT EXECUTE ON FUNCTION public.run_global_system_repair(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fix_returns_schema() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- 📱 منح صلاحيات القراءة لـ anon لبعض الجداول المختارة لعمل الكيو آر منيو
GRANT SELECT ON public.restaurant_tables TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.item_categories TO anon;
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT ON public.uoms TO anon;
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.modifier_groups TO anon;
GRANT SELECT ON public.modifiers TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid) TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_shift_report(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_payroll_rpc(integer, integer, date, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_treasury_transfer(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revalue_product_cost(numeric, text, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_wastage(date, jsonb, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_missing_system_accounts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_financial_year(integer, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_financial_year(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organization_from_backup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_backup_comprehensiveness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_backup_integrity(uuid, jsonb) TO authenticated;

-- 🕒 جدولة النسخ الاحتياطي التلقائي (Automated SaaS Backup)
-- الوصف: يتم تشغيل هذه المهمة عبر pg_cron لعمل نسخة احتياطية لكافة المنظمات النشطة كل ليلة الساعة 3 فجراً.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- إلغاء الجدولة القديمة لتجنب التكرار في حال إعادة تشغيل السكريبت
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''daily-saas-backup'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- جدولة النسخ الاحتياطي الساعة 3 فجراً يومياً
        -- التوقيت: (دقيقة 0، ساعة 3، يوم *، شهر *، أسبوع *)
        PERFORM cron.schedule('daily-saas-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');

        RAISE NOTICE '✅ تم ضبط جدولة النسخ الاحتياطي التلقائي الساعة 3 فجراً بنجاح.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron غير مفعل. النسخ الاحتياطي التلقائي يحتاج لتفعيل الإضافة من لوحة تحكم Supabase (Database -> Extensions).';
    END IF;
END $$;

-- 🚀 تنشيط ذاكرة المخطط فوراً لضمان ظهور الدوال في الـ API (حل مشكلة 404)
NOTIFY pgrst, 'reload config';

-- 🛡️ تم إزالة PERFORM recalculate_stock_rpc() من هنا لتجنب الـ Timeout أثناء التثبيت الأولي
DO $$ BEGIN
    RAISE NOTICE '✅ تم تثبيت المحرك الشامل الموحد بنجاح. النظام الآن جاهز ومؤمن.';
END $$;

-- 🛠️ دالة تصفير المخزون السالب (للوصول لـ 100% موثوقية في العروض التوضيحية)
CREATE OR REPLACE FUNCTION public.fix_negative_stock_for_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.products SET stock = 0 WHERE stock < 0 AND organization_id = public.get_my_org();
    PERFORM public.recalculate_stock_rpc(public.get_my_org());
END; $$;

-- 🛠️ دالة فحص الجاهزية للإطلاق (SaaS Pre-Launch Health Check)
-- الغرض: التأكد من سلامة الشركة محاسبياً وتقنياً قبل الاستخدام الفعلي
CREATE OR REPLACE FUNCTION public.check_company_launch_readiness(p_org_id uuid DEFAULT public.get_my_org())
RETURNS TABLE (
    "المعيار" text,
    "الحالة" text,
    "التفاصيل" text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. فحص توازن القيود
    "المعيار" := 'توازن القيود المحاسبية';
    IF EXISTS (SELECT 1 FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id 
               WHERE je.organization_id = p_org_id GROUP BY je.id HAVING ABS(SUM(debit - credit)) > 0.01) THEN
        "الحالة" := '❌ خطأ'; "التفاصيل" := 'يوجد قيود غير متزنة في الأستاذ العام.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'كافة القيود المرحلة متزنة تماماً.';
    END IF;
    RETURN NEXT;

    -- 2. فحص إعدادات الربط المحاسبي
    "المعيار" := 'ربط الحسابات السيادية';
    IF EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = p_org_id 
               AND (account_mappings->>'CASH' IS NULL OR account_mappings->>'SALES_REVENUE' IS NULL)) THEN
        "الحالة" := '⚠️ تحذير'; "التفاصيل" := 'إعدادات الربط المحاسبي (النقدية/المبيعات) غير مكتملة.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'تم ربط الحسابات الأساسية بنجاح.';
    END IF;
    RETURN NEXT;

    -- 3. فحص المخزون السالب
    "المعيار" := 'سلامة أرصدة المخزون';
    IF EXISTS (SELECT 1 FROM public.products WHERE organization_id = p_org_id AND stock < 0) THEN
        "الحالة" := '⚠️ تحذير'; "التفاصيل" := 'يوجد أصناف برصيد سالب، قد تؤثر على دقة التكلفة.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'لا يوجد مخزون سالب حالياً.';
    END IF;
    RETURN NEXT;

    -- 4. فحص النسخ الاحتياطي
    "المعيار" := 'وجود نسخة احتياطية';
    IF EXISTS (SELECT 1 FROM public.organization_backups WHERE organization_id = p_org_id) THEN
        "الحالة" := '✅ سليم'; "التفاصيل" := 'تم أخذ نسخة احتياطية واحدة على الأقل لهذه الشركة.';
    ELSE
        "الحالة" := '❌ خطر'; "التفاصيل" := 'لم يتم إنشاء أي نسخة احتياطية لهذه الشركة حتى الآن.';
    END IF;
    RETURN NEXT;
END; $$;

-- 🛡️ [V51.5] درع تدقيق الفواتير (Deep Invoice Audit)
-- المهمة: رصد أي محاولة لتغيير الأسعار أو الخصومات بعد صدور الفاتورة
CREATE OR REPLACE FUNCTION public.fn_audit_sensitive_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR 
       (OLD.discount_amount IS DISTINCT FROM NEW.discount_amount) OR
       (OLD.status = 'posted' AND NEW.status = 'draft') THEN
        
        INSERT INTO public.security_logs (
            event_type, 
            description, 
            performed_by, 
            organization_id, 
            metadata
        ) VALUES (
            'invoice_tampering_alert',
            format('تعديل حساس في مبالغ الفاتورة رقم %s', NEW.invoice_number),
            auth.uid(),
            NEW.organization_id,
            jsonb_build_object(
                'invoice_id', NEW.id,
                'old_total', OLD.total_amount,
                'new_total', NEW.total_amount,
                'old_discount', OLD.discount_amount,
                'new_status', NEW.status
            )
        );
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_invoice_changes ON public.invoices;
CREATE TRIGGER trg_audit_invoice_changes
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_sensitive_invoice_changes();

GRANT EXECUTE ON FUNCTION public.check_company_launch_readiness(uuid) TO authenticated;