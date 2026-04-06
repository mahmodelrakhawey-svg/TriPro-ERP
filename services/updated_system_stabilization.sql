-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-04-03
-- الوصف: يضمن تحديث هيكل قاعدة البيانات، إضافة أعمدة الـ SaaS، وتفعيل درع حماية البيانات (RLS) لكافة الجداول.

BEGIN;

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
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS account_mappings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS logo_url text;

-- ============================================================
-- 4. حماية الرؤية والإدارة للسوبر أدمن (Super Admin Access)
-- ============================================================

-- استثناء لجدول المنظمات
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins view all organizations" ON public.organizations;
CREATE POLICY "Super admins view all organizations" ON public.organizations FOR SELECT TO authenticated USING (public.get_my_role() = 'super_admin');

-- استثناء لجدول المستخدمين (رؤية وتحديث لإدارة المنصة)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins view all profiles" ON public.profiles;
CREATE POLICY "Super admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "Super admins update own profiles" ON public.profiles;
CREATE POLICY "Super admins update own profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.get_my_role() = 'super_admin') WITH CHECK (public.get_my_role() = 'super_admin');

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
    tables text[] := ARRAY[
        'accounts', 'products', 'customers', 'suppliers', 'warehouses', 'cost_centers', 
        'orders', 'order_items', 'payments', 'shifts', 'journal_entries', 'journal_lines', 
        'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'receipt_vouchers', 'payment_vouchers',
        'cheques', 'credit_notes', 'debit_notes', 'stock_adjustments', 'stock_transfers', 'inventory_counts', 'work_orders',
        'assets', 'employees', 'payrolls', 'payroll_items', 'notifications'
    ];
    v_count_before int;
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) AND t != 'accounts' THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t) INTO v_count_before;
            EXECUTE format('UPDATE public.%I SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL', t);
            
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            
            -- تنظيف السياسات القديمة
            EXECUTE format('DROP POLICY IF EXISTS "Isolation_Policy_%I" ON public.%I', t, t);
            EXECUTE format('DROP POLICY IF EXISTS "Select_Policy_%I" ON public.%I', t, t);
            EXECUTE format('DROP POLICY IF EXISTS "Modify_Policy_%I" ON public.%I', t, t);
            
            -- سياسة القراءة للجميع بما فيهم الديمو
            EXECUTE format('CREATE POLICY "Select_Policy_%I" ON public.%I FOR SELECT TO authenticated USING (organization_id = public.get_my_org())', t, t);
            
            -- سياسة التعديل والحذف محظورة على الديمو
            EXECUTE format('CREATE POLICY "Modify_Policy_%I" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.get_my_role() != ''demo'') WITH CHECK (organization_id = public.get_my_org() AND public.get_my_role() != ''demo'')', t, t);

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
            ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
            
            DROP POLICY IF EXISTS "Isolation_Policy_accounts" ON public.accounts;
            DROP POLICY IF EXISTS "Select_Policy_accounts" ON public.accounts;
            DROP POLICY IF EXISTS "Modify_Policy_accounts" ON public.accounts;
            
            CREATE POLICY "Select_Policy_accounts" ON public.accounts FOR SELECT TO authenticated USING (organization_id = public.get_my_org());
            CREATE POLICY "Modify_Policy_accounts" ON public.accounts FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.get_my_role() != 'demo') WITH CHECK (organization_id = public.get_my_org() AND public.get_my_role() != 'demo');
        END IF;
    END LOOP;
END $$;

COMMIT;
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;