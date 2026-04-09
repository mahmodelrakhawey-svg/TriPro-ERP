-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-04-08 (SaaS Sync Version)
-- الوصف: يضمن تحديث هيكل قاعدة البيانات، إضافة أعمدة الـ SaaS، وتفعيل درع حماية البيانات (RLS) لكافة الجداول.

BEGIN;

-- ============================================================
-- 0. إصلاح الدوال الأساسية للهوية (Core Identity Functions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- تم الإصلاح: تجنب الاستعلام من public.profiles لمنع حلقة التكرار (Infinite Recursion)
    RETURN COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid,
        (SELECT (raw_user_meta_data->>'org_id')::uuid FROM auth.users WHERE id = auth.uid())
    );
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role',
    (SELECT role::text FROM public.profiles WHERE id = auth.uid())
  );
END; $$;

-- ============================================================
-- 1. توحيد أسماء أعمدة المرتجعات (Schema Standardization)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
        END IF;
    END IF;
END $$;

-- ============================================================
-- 1.5 توحيد أعمدة نقاط البيع والمطاعم (POS Schema Sync)
-- ============================================================
DO $$ BEGIN
    -- تحديث جدول الطلبات (orders)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_by') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='user_id') THEN
            ALTER TABLE public.orders RENAME COLUMN created_by TO user_id;
        ELSE
            -- إذا كان كلاهما موجوداً، انقل البيانات للعمود الجديد واحذف القديم لتجنب التعارض
            UPDATE public.orders SET user_id = created_by WHERE user_id IS NULL;
            ALTER TABLE public.orders DROP COLUMN created_by;
        END IF;
    END IF;

    -- تحديث جدول بنود الطلبات (order_items)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='unit_price') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
            ALTER TABLE public.order_items RENAME COLUMN unit_price TO price;
        ELSE
            UPDATE public.order_items SET price = unit_price WHERE price IS NULL;
            ALTER TABLE public.order_items DROP COLUMN unit_price;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total_price') THEN
            ALTER TABLE public.order_items RENAME COLUMN total TO total_price;
        ELSE
            UPDATE public.order_items SET total_price = total WHERE total_price IS NULL;
            ALTER TABLE public.order_items DROP COLUMN total;
        END IF;
    END IF;
    
    RAISE NOTICE '✅ تم توحيد مسميات أعمدة الـ POS بنجاح.';
END $$;

-- ============================================================
-- 2. إضافة أعمدة الـ SaaS والاشتراكات لجدول المنظمات
-- ============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting"}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expiry date;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5;

-- ============================================================
-- 3. تحديث إعدادات الشركة (Company Settings)
-- ============================================================
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS max_cash_deficit_limit numeric DEFAULT 500;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS activity_type text;

-- تحديث جدول التصنيفات (fix_item_categories_description)
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS image_url text;

-- ضمان القيد الفريد لجدول الإعدادات
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_organization_id_unique;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_organization_id_unique UNIQUE (organization_id);

-- استثناء لجدول المنظمات
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_select_policy" ON public.organizations;
CREATE POLICY "org_select_policy" ON public.organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "org_update_policy" ON public.organizations;
CREATE POLICY "org_update_policy" ON public.organizations FOR UPDATE TO authenticated USING ((id = public.get_my_org() AND public.get_my_role() IN ('admin', 'super_admin')) OR public.get_my_role() = 'super_admin');

-- استثناء لجدول المستخدمين (رؤية وتحديث لإدارة المنصة)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- حذف جميع السياسات القديمة لتجنب التعارض
DO $$ 
BEGIN
    EXECUTE (SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.profiles;', ' ') FROM pg_policies WHERE tablename = 'profiles');
END $$;

-- السياسات الصحيحة والآمنة لجدول المستخدمين
DROP POLICY IF EXISTS "profiles_select_v2" ON public.profiles;
CREATE POLICY "profiles_select_v2" ON public.profiles FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "profiles_update_v2" ON public.profiles;
CREATE POLICY "profiles_update_v2" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid() OR public.get_my_role() IN ('admin', 'super_admin')) WITH CHECK (id = auth.uid() OR public.get_my_role() IN ('admin', 'super_admin'));
DROP POLICY IF EXISTS "profiles_insert_v2" ON public.profiles;
CREATE POLICY "profiles_insert_v2" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- ============================================================
-- 5. تحديثات الجداول المالية (Financial Linkage)
-- ============================================================
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);

-- ربط المرتجعات بالفواتير
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);

-- تحديثات العملاء والمخزون
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14;

-- تحديثات مديول الرواتب (Payroll Sync)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0;
ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();

-- ============================================================
-- 6. إصلاح نظام الإشعارات (Notifications Fix)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
            ALTER TABLE public.notifications RENAME COLUMN notification_type TO "type";
        ELSE
            ALTER TABLE public.notifications ALTER COLUMN notification_type DROP NOT NULL;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create notifications') THEN
        CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.get_my_role() != 'demo');
    END IF;
END $$;

-- ============================================================
-- 7. تهيئة التسلسلات والعملات (Localization)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
UPDATE public.company_settings SET currency = 'EGP', vat_rate = 0.14 WHERE currency IS NULL OR currency = 'SAR';

-- ============================================================
-- 8. درع الحماية الشامل (The Shield - Multi-tenancy Isolation)
-- ============================================================
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[ -- تم استثناء 'profiles' من هنا
        'accounts', 'products', 'customers', 'suppliers', 'warehouses', 'cost_centers', 
        'orders', 'order_items', 'payments', 'shifts', 'journal_entries', 'journal_lines', 
        'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'receipt_vouchers', 'payment_vouchers', 'menu_categories',
        'cheques', 'credit_notes', 'debit_notes', 'stock_adjustments', 'stock_transfers', 'inventory_counts', 'work_orders',
        'assets', 'employees', 'payrolls', 'payroll_items', 'notifications'
    ];
    v_count_before int;
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) AND t NOT IN ('accounts', 'profiles') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.get_my_org()', t);
            EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t) INTO v_count_before;
            EXECUTE format('UPDATE public.%I SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL', t);
            
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            
            -- تنظيف السياسات القديمة
            EXECUTE format('DROP POLICY IF EXISTS "Isolation_Policy_%I" ON public.%I', t, t);
            EXECUTE format('DROP POLICY IF EXISTS "Select_Policy_%I" ON public.%I', t, t);
            EXECUTE format('DROP POLICY IF EXISTS "Modify_Policy_%I" ON public.%I', t, t);
            
            -- سياسة القراءة للجميع (عزل الشركات)
            EXECUTE format('CREATE POLICY "Select_Policy_%I" ON public.%I FOR SELECT TO authenticated USING (organization_id = public.get_my_org())', t, t);
            
            -- سياسة التعديل (فقط للأدوار المصرح لها، ومنع الديمو والمشاهد)
            EXECUTE format('CREATE POLICY "Modify_Policy_%I" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.get_my_role() NOT IN (''demo'', ''viewer'')) WITH CHECK (organization_id = public.get_my_org() AND public.get_my_role() NOT IN (''demo'', ''viewer''))', t, t);

            BEGIN
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;

        IF t = 'accounts' THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'organization_id') THEN
                ALTER TABLE public.accounts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
                UPDATE public.accounts SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL;
            END IF;

            -- التأكد من وجود القيد الفريد المركب المطلوب للدوال المحاسبية
            ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;
            ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_org_code_unique;
            ALTER TABLE public.accounts ADD CONSTRAINT accounts_org_code_unique UNIQUE (organization_id, code);

            ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
            
            DROP POLICY IF EXISTS "Isolation_Policy_accounts" ON public.accounts;
            DROP POLICY IF EXISTS "Select_Policy_accounts" ON public.accounts;
            DROP POLICY IF EXISTS "Modify_Policy_accounts" ON public.accounts;
            
            CREATE POLICY "Select_Policy_accounts" ON public.accounts FOR SELECT TO authenticated USING (organization_id = public.get_my_org());
            CREATE POLICY "Modify_Policy_accounts" ON public.accounts FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.get_my_role() NOT IN ('demo', 'viewer')) WITH CHECK (organization_id = public.get_my_org() AND public.get_my_role() NOT IN ('demo', 'viewer'));
        END IF;
    END LOOP;
END $$;

COMMIT;
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;