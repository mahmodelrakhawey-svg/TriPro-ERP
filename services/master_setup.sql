-- 🌟 ملف التأسيس الشامل (Master Setup) - TriPro ERP
-- 📅 تاريخ التحديث: 2026-06-16 (Safe Idempotent Version)
-- ℹ️ الوصف: النسخة الهيكلية الآمنة - تحديث الهيكل دون مسح البيانات.
-- ================================================================
-- 0. إعداد المخطط (Schema Setup)
-- ================================================================
-- ⚠️ تم إيقاف المسح الكامل للمخطط لسلامة بيئة SaaS
-- في حال الرغبة في مسح شامل، قم بتشغيل DROP SCHEMA public CASCADE يدوياً مرة واحدة فقط.
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 🛡️ Schema Healing: التأكد من وجود الأعمدة الحساسة قبل البدء لتجنب خطأ 42703 (organization_id)
-- يحدث هذا إذا كانت الجداول منشأة مسبقاً بنسخة قديمة من النظام وتفتقر لهيكل الـ SaaS
DO $$ 
DECLARE 
    t text;
    tables_to_heal text[] := ARRAY['profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'work_orders', 'mfg_production_orders', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'sales_orders', 'sales_order_items', 'employees', 'employee_advances'];
    dup record;
    tables_with_user_id text[] := ARRAY['orders', 'journal_entries', 'shifts', 'table_sessions', 'cash_closings', 'organization_backups', 'notifications', 'receipt_vouchers', 'payment_vouchers'];
    user_id_table text;
BEGIN
    -- 0. ترميم جدول المنظمات (SaaS Organizations Repair)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
        ALTER TABLE public.organizations 
            ADD COLUMN IF NOT EXISTS email text,
            ADD COLUMN IF NOT EXISTS phone text,
            ADD COLUMN IF NOT EXISTS address text,
            ADD COLUMN IF NOT EXISTS vat_number text,
            ADD COLUMN IF NOT EXISTS logo_url text,
            ADD COLUMN IF NOT EXISTS footer_text text,
            ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting", "inventory", "sales", "purchases", "hr", "manufacturing", "restaurant"}',
            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
            ADD COLUMN IF NOT EXISTS subscription_expiry date,
            ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5,
            ADD COLUMN IF NOT EXISTS activity_type text;
    END IF;

    -- 🛡️ ترميم جدول المستودعات (Warehouses Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses' AND table_schema = 'public') THEN
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
    END IF;

    -- 🛡️ ترميم جدول إعدادات الشركة (Company Settings Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings' AND table_schema = 'public') THEN
        ALTER TABLE public.company_settings 
            ADD COLUMN IF NOT EXISTS production_warehouse_id uuid,
            ADD COLUMN IF NOT EXISTS raw_material_warehouse_id uuid;
    END IF;

    -- 🛡️ ترميم جداول أوامر البيع (Sales Orders Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.sales_orders 
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;
    END IF;

    -- 🛡️ ترميم جدول الموظفين (Employees Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees' AND table_schema = 'public') THEN
        ALTER TABLE public.employees 
            ADD COLUMN IF NOT EXISTS name text,
            ADD COLUMN IF NOT EXISTS position text,
            ADD COLUMN IF NOT EXISTS department text,
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
            ALTER COLUMN name DROP NOT NULL,
            ALTER COLUMN full_name DROP NOT NULL;
    END IF;

    -- 🛡️ ترميم جدول الفواتير (Invoices Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(19,4) DEFAULT 1;
    END IF;

    -- 1. إضافة عمود المنظمة المفقود (Multi-tenancy Enforcer)
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
            -- الربط بالمنظمة الحالية للسجلات اليتيمة
            EXECUTE format('UPDATE public.%I SET organization_id = public.get_my_org() WHERE organization_id IS NULL AND public.get_my_org() IS NOT NULL', t);
        END IF;
    END LOOP;

    -- 🛡️ ترميم أعمدة التكلفة لجدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public') THEN
        ALTER TABLE public.products 
            ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;
    END IF;

    -- 🛡️ ترميم جدول الحسابات (Accounts Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts' AND table_schema = 'public') THEN
        ALTER TABLE public.accounts 
            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
        
        ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;

        FOR dup IN (
            SELECT organization_id, code, 
                   (ARRAY_AGG(id ORDER BY created_at DESC))[1] as correct_id,
                   (ARRAY_AGG(id ORDER BY created_at DESC))[2:] as wrong_ids
            FROM public.accounts
            GROUP BY organization_id, code
            HAVING COUNT(*) > 1
        ) LOOP
            UPDATE public.journal_lines SET account_id = dup.correct_id WHERE account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET inventory_account_id = dup.correct_id WHERE inventory_account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET sales_account_id = dup.correct_id WHERE sales_account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET cogs_account_id = dup.correct_id WHERE cogs_account_id = ANY(dup.wrong_ids);
            UPDATE public.accounts SET parent_id = dup.correct_id WHERE parent_id = ANY(dup.wrong_ids);
            DELETE FROM public.accounts WHERE id = ANY(dup.wrong_ids);
        END LOOP;

        ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_organization_id_code_key;
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code);
        
        UPDATE public.accounts SET is_group = true WHERE length(code) <= 2;
        UPDATE public.accounts SET is_group = true 
        WHERE id IN (SELECT DISTINCT parent_id FROM public.accounts WHERE parent_id IS NOT NULL);
    END IF;

    -- 🛡️ ترميم جدول الأدوار (Roles Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles' AND table_schema = 'public') THEN
        ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;
        ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_organization_id_key;
        ALTER TABLE public.roles ADD CONSTRAINT roles_name_organization_id_key UNIQUE (name, organization_id);
    END IF;

    -- 2. توحيد مسمى user_id (ترميم العمود المفقود)
    FOREACH user_id_table IN ARRAY tables_with_user_id LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = user_id_table AND table_schema = 'public') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'created_by') 
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'user_id') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN created_by TO user_id', user_id_table);
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'user_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id)', user_id_table);
            END IF;
        END IF;
    END LOOP;

    -- 3. إضافة عمود الوصف المفقود في جدول الصلاحيات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions' AND table_schema = 'public') THEN
        ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;
    END IF;
END $$;

-- ================================================================
-- 1. الجداول الأساسية (Core Tables)
-- ================================================================

-- المنظمات والإعدادات
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    vat_number text,
    address text,
    phone text,
    email text,
    logo_url text,
    footer_text text,
    allowed_modules text[] DEFAULT '{"accounting", "inventory", "sales", "purchases", "hr", "manufacturing", "restaurant"}',
    is_active boolean DEFAULT true,
    subscription_expiry date,
    max_users integer DEFAULT 5,
    suspension_reason text,
    total_collected numeric DEFAULT 0,
    next_payment_date date,
    activity_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- جدول النسخ الاحتياطية للمنظمات (SaaS Backups) - تم نقل دالة الإنشاء لملف الدوال
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_date timestamptz DEFAULT now(),
    backup_data jsonb NOT NULL,
    file_size_kb numeric,
    created_by uuid REFERENCES auth.users(id),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الهوية الموحدة (Standard Identity Helpers)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    -- 1. فحص التوكن أولاً (JWT Claims) - البحث في user_metadata و app_metadata لضمان التوافق
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role', '')
    );
    IF _role IS NULL THEN
        _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    END IF;
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    -- 2. الرجوع للجدول (Fall-back)
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
DECLARE _role text;
BEGIN
    -- 1. جلب المنظمة والدور من البروفايل مباشرة (المصدر الأكثر ثقة)
    SELECT organization_id, role INTO _org_id, _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    -- 2. السوبر أدمن: البحث في التوكن (في حال كان يتنقل بين الشركات)
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    -- 🛡️ صمام أمان: إذا كان المستخدم موثقاً ولم يتم تحديد منظمة، ارفع خطأ
    -- 🚀 تحديث: التحقق المزدوج من الدور لمنع الخطأ عند السوبر أدمن
    IF _org_id IS NULL AND auth.uid() IS NOT NULL THEN
        -- إذا لم نجد الدور في المتغير، نجلب الدور العام
        _role := COALESCE(_role, public.get_my_role());
        IF _role NOT IN ('super_admin', 'owner', 'demo') THEN
            RAISE EXCEPTION 'فشل تحديد المنظمة للمستخدم الموثق. يرجى التأكد من ربط المستخدم بمنظمة.';
        END IF;
    END IF;
    RETURN _org_id;
END; $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN (public.get_my_role() IN ('super_admin', 'admin', 'owner')); END; $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (public.get_my_role() = 'super_admin');
END; $$;

-- الصلاحيات والمستخدمين
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    UNIQUE(name, organization_id) -- السماح بنفس الاسم لشركات مختلفة
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module text NOT NULL,
    action text NOT NULL,
    description text,
    UNIQUE(module, action)
);

-- تعبئة الصلاحيات الأساسية للنظام لضمان منحها للأدمن تلقائياً عند إنشاء شركة جديدة
-- 🛡️ صمام أمان: التأكد من وجود عمود الوصف في حال كان الجدول منشأ مسبقاً بدون هذا العمود
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;

INSERT INTO public.permissions (module, action, description) VALUES
('sales', 'view', 'عرض المبيعات'),
('sales', 'create', 'إنشاء فاتورة مبيعات'),
('sales', 'update', 'تعديل فاتورة مبيعات'),
('sales', 'delete', 'حذف فاتورة مبيعات'),
('sales', 'approve', 'اعتماد الفواتير'),
('sales', 'return', 'إدارة مرتجعات المبيعات'),
('sales', 'quotation', 'إدارة عروض الأسعار'),
('purchases', 'view', 'عرض المشتريات'),
('purchases', 'create', 'إنشاء فاتورة مشتريات'),
('purchases', 'update', 'تعديل فاتورة مشتريات'),
('purchases', 'delete', 'حذف فاتورة مشتريات'),
('products', 'view', 'عرض المنتجات'),
('products', 'create', 'إضافة منتجات'),
('products', 'update', 'تعديل منتجات'),
('products', 'delete', 'حذف منتجات'),
('products', 'bom', 'إدارة وصفات التصنيع'),
('inventory', 'view', 'عرض المخزون والتقارير'),
('inventory', 'manage', 'إدارة تسويات المخازن'),
('inventory', 'transfer', 'إدارة التحويلات المخزنية'),
('inventory', 'wastage', 'إدارة الهالك والمفقودات'),
('manufacturing', 'view', 'لوحة تحكم التصنيع'),
('manufacturing', 'orders', 'أوامر الإنتاج التشغيلية'),
('manufacturing', 'work_centers', 'إدارة مراكز العمل'),
('manufacturing', 'routings', 'إدارة مسارات الإنتاج'),
('manufacturing', 'qc', 'رقابة الجودة (QC)'),
('manufacturing', 'material_requests', 'طلبات صرف المواد الخام'),
('manufacturing', 'serials', 'تتبع الأرقام التسلسلية'),
('hr', 'view', 'عرض الموظفين'),
('hr', 'manage', 'إدارة الرواتب'),
('hr', 'advances', 'إدارة سلف الموظفين'),
('accounting', 'view', 'عرض القيود والتقارير'),
('accounting', 'coa', 'إدارة دليل الحسابات'),
('accounting', 'create', 'إنشاء قيود محاسبية'),
('accounting', 'update', 'تعديل القيود المحاسبية'),
('accounting', 'delete', 'حذف القيود المحاسبية'),
('accounting', 'reconcile', 'التسويات البنكية'),
('accounting', 'post', 'ترحيل القيود المحاسبية'),
('treasury', 'view', 'عرض الخزينة'),
('treasury', 'create', 'إنشاء سندات'),
('treasury', 'update', 'تعديل سندات'),
('treasury', 'manage', 'إدارة الخزينة'),
('restaurant', 'manage', 'إدارة المطعم'),
('restaurant', 'pos', 'الوصول لنقطة البيع'),
('restaurant', 'kitchen', 'عرض شاشة المطبخ'),
('treasury', 'cheques', 'إدارة الشيكات (قبض ودفع)'),
('assets', 'manage', 'إدارة الأصول الثابتة'),
('reports', 'view_financial', 'عرض التقارير المالية الحساسة'),
('admin', 'backups', 'إدارة النسخ الاحتياطي والاستعادة'),
('admin', 'logs', 'سجلات أمان النظام'),
('admin', 'manage', 'إدارة الصلاحيات')
ON CONFLICT (module, action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);

-- جدول الدعوات (Invitations) للتحكم في من يمكنه الانضمام للنظام
CREATE TABLE IF NOT EXISTS public.invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL UNIQUE,
    role text DEFAULT 'viewer',
    organization_id uuid REFERENCES public.organizations(id),
    invited_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz
);

-- دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
-- [تم نقل دوال الـ Triggers والمنطق البرمجي إلى deploy_all_functionss.sql]

CREATE TABLE IF NOT EXISTS public.company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text,
    tax_number text,
    activity_type text,
    phone text,
    address text,
    footer_text text,
    logo_url text,
    vat_rate numeric DEFAULT 0.14,
    currency text DEFAULT 'EGP',
    enable_tax boolean DEFAULT true,
    allow_negative_stock boolean DEFAULT false,
    prevent_price_modification boolean DEFAULT false,
    last_closed_date date,
    decimal_places integer DEFAULT 2,
    max_cash_deficit_limit numeric DEFAULT 500,
    account_mappings jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_treasury_id uuid,  -- عمود لربط الخزينة الافتراضية
    production_warehouse_id uuid, -- عمود لمستودع الإنتاج
    raw_material_warehouse_id uuid, -- عمود لمستودع المواد الخام
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org() UNIQUE,
    updated_at timestamptz DEFAULT now()
);

-- جداول تقنية مفقودة (تم استنتاجها من الدوال)
CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    error_message text,
    error_code text,
    context jsonb,
    function_name text,
    user_id uuid,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- المحاسبة
CREATE TABLE IF NOT EXISTS public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_date date DEFAULT now(),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now(),
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    related_document_id uuid,
    related_document_type text,
    CONSTRAINT journal_entries_reference_org_unique UNIQUE (organization_id, reference)
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0 CHECK (debit >= 0),
    credit numeric(19,4) DEFAULT 0 CHECK (credit >= 0),
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    CONSTRAINT journal_lines_debit_credit_check CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE TABLE IF NOT EXISTS public.journal_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- العملاء والموردين
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    credit_limit numeric DEFAULT 0,
    opening_balance numeric DEFAULT 0,
    customer_type text DEFAULT 'individual', -- individual, store, online
    balance numeric DEFAULT 0, -- حقل محسوب (اختياري للأداء)
    deleted_at timestamptz, -- Changed to timestamptz for consistency
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    contact_person text,
    opening_balance numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0, -- Changed to numeric for consistency
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    credit_limit numeric DEFAULT 0
);

-- المخزون والمنتجات
CREATE TABLE IF NOT EXISTS public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    manager text,
    phone text,
    is_active boolean DEFAULT true, -- 🛡️ تم إضافة هذا العمود لإصلاح خطأ 42703 في دالة تأسيس الشركات
    type text DEFAULT 'warehouse',
     organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deleted_at timestamptz,
     deletion_reason text,
     UNIQUE (organization_id, name)
);
-- تصنيفات الأصناف (موجود في الهيكل الحالي)
CREATE TABLE IF NOT EXISTS public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id), -- Changed to uuid for consistency
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (organization_id, name)
);

-- فهرس البحث السريع للتصنيفات
CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    barcode text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    description text,
    cost numeric(19,4) DEFAULT 0,
    manufacturing_cost numeric(19,4) DEFAULT 0,
    labor_cost numeric(19,4) DEFAULT 0,
    overhead_cost numeric(19,4) DEFAULT 0,
    is_overhead_percentage boolean DEFAULT false,
    opening_balance numeric(19,4) DEFAULT 0,
    weighted_average_cost numeric(19,4) DEFAULT 0,
    stock numeric DEFAULT 0,
    unit text,
min_stock numeric DEFAULT 5,
    min_stock_level numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK',
    product_type text DEFAULT 'STOCK', -- إضافة هذا العمود لتوافق الواجهة الأمامية
    mfg_type text DEFAULT 'standard', -- raw, standard, intermediate
    requires_serial boolean DEFAULT false,
    price numeric DEFAULT 0,
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    category_id uuid REFERENCES public.item_categories(id),
    expiry_date date,
    available_modifiers jsonb DEFAULT '[]'::jsonb,
    
    -- حقول العروض
    offer_price numeric,
    offer_start_date date,
    offer_end_date date,
    offer_max_qty numeric,
    
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- المبيعات والمشتريات
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid, -- يمكن ربطه بجدول المستخدمين
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric(19,4) DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text, -- draft, posted, paid, partial
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    currency text DEFAULT 'EGP',
    exchange_rate numeric(19,4) DEFAULT 1,
    approver_id uuid REFERENCES auth.users(id), -- عمود جديد
    reference text, -- عمود جديد
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT invoices_number_org_unique UNIQUE (organization_id, invoice_number)
);

-- أوامر البيع (Sales Orders) - المستند الوسيط للتصنيع
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    order_date date DEFAULT now(),
    status text DEFAULT 'draft', -- draft, confirmed, manufacturing, ready, invoiced
    total_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(organization_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 1,
    unit_price numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- 2. جداول المبيعات والمشتريات (Detailed Version)
-- تم استبدال الكتل المبسطة والمكررة بهذه النسخة السيادية الموحدة

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    unit_price numeric NOT NULL DEFAULT 0,
    total numeric(19,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    discount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    custom_fields jsonb,
    cost numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- ================================================================
-- 2. جداول العمليات الأساسية (Missing Core Tables)
-- ================================================================

-- المشتريات
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric(19,4),
    subtotal numeric,
    status text DEFAULT 'draft',
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    currency text DEFAULT 'EGP',
    exchange_rate numeric(19,4) DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    paid_amount numeric DEFAULT 0,
    delivery_fee numeric DEFAULT 0,
    order_type text DEFAULT 'DINE_IN',
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    CONSTRAINT purchase_invoices_number_org_unique UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    unit_price numeric(19,4) NOT NULL DEFAULT 0,
    total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- الخزينة والسندات
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date DEFAULT now(),
    amount numeric NOT NULL DEFAULT 0,
    recipient_name text,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    payment_method text DEFAULT 'cash',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (organization_id, voucher_number)
);

CREATE TABLE IF NOT EXISTS public.payment_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    payment_date date DEFAULT now(),
    amount numeric NOT NULL DEFAULT 0,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    payment_method text DEFAULT 'cash',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (organization_id, voucher_number)
);

-- المطاعم ونقاط البيع
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    capacity integer DEFAULT 4,
    status text DEFAULT 'AVAILABLE',
    qr_access_key uuid DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    bill_requested boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text,
    session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id),
    status text DEFAULT 'PENDING',
    subtotal numeric DEFAULT 0,
    total_tax numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    delivery_fee numeric DEFAULT 0,
    order_type text DEFAULT 'DINE_IN',
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    user_id uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0,
    total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    unit_cost numeric DEFAULT 0,
    notes text,
    modifiers jsonb DEFAULT '[]'::jsonb,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 🍕 خيارات الإضافات للمطعم (Modifiers Support)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    min_selection integer DEFAULT 0,
    max_selection integer DEFAULT 1,
    is_required boolean DEFAULT false,
    display_order integer DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    modifier_group_id uuid REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name text NOT NULL,
    price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    is_available boolean DEFAULT true,
    display_order integer DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid REFERENCES public.modifiers(id) ON DELETE SET NULL,
    name text,
    unit_price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name text, -- المسمى المعتمد في الكود الجديد (تم إلغاء NOT NULL للاستقرار)
    name text,              -- للتوافق مع قواعد البيانات القديمة
    position text,
    phone text,
    email text,
    salary numeric DEFAULT 0,
    hire_date date,
    department text,
    notes text,              -- 🛠️ الإصلاح المطلوب لخطأ السكيما
    status text DEFAULT 'active',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status_updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- 3. جداول المدفوعات (Payments Table)
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    payment_method text NOT NULL, -- cash, card, credit, etc.
    status text DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED, REFUNDED
    transaction_id text, -- معرف العملية من بوابة الدفع
    cash_account_id uuid REFERENCES public.accounts(id), -- الحساب النقدي أو البنكي الذي تم التحصيل فيه
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- جداول الروابط والوردات (Missing in Master Setup)
CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    opening_balance numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    treasury_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    status text DEFAULT 'OPEN',
    notes text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name text,
    customer_phone text,
    delivery_address text,
    delivery_fee numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_allowances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    name text NOT NULL,
    amount numeric NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payroll_variables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    month integer NOT NULL,
    year integer NOT NULL,
    type text CHECK (type IN ('addition', 'deduction')),
    amount numeric NOT NULL,
    is_processed boolean DEFAULT false,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- سلف الموظفين (Employee Advances)
CREATE TABLE IF NOT EXISTS public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    amount numeric NOT NULL DEFAULT 0,
    request_date date DEFAULT now(),
    advance_date date DEFAULT now(),
    status text DEFAULT 'paid', -- paid, deducted, cancelled
    payroll_item_id uuid,
    treasury_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    reference text,          -- 🛠️ إضافة عمود المرجع (Reference) المسبب للخطأ
    notes text,
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 3. جداول إضافية (مرفقات، إقفال، إشعارات)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.receipt_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.receipt_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric, -- Changed to numeric for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cheque_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_id uuid REFERENCES public.cheques(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    closing_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric DEFAULT 0,
    actual_balance numeric DEFAULT 0,
    difference numeric DEFAULT 0,
    notes text,
    status text DEFAULT 'closed',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rejected_cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rejection_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric NOT NULL,
    actual_balance numeric NOT NULL,
    difference numeric NOT NULL,
    notes text,
    rejected_by uuid REFERENCES public.profiles(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    max_allowed_deficit numeric
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    credit_note_number text,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_note_number text,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    description text,
    performed_by uuid REFERENCES auth.users(id),
    target_user_id uuid REFERENCES public.profiles(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    metadata jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.budgets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    year integer,
    month integer,
    items jsonb,
    name text,
    total_amount numeric, -- Changed to numeric for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- (تم تنظيف كافة التكرارات والكتل المبسطة لضمان "المرجعية الواحدة" للبيانات)
-- (الملف الآن ينتهي بآخر تعريف سيادي للجداول قبل مرحلة الدوال والسياسات)

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON public.notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_overdue_payments BOOLEAN DEFAULT TRUE,
  enable_low_inventory BOOLEAN DEFAULT TRUE,
  enable_high_debt BOOLEAN DEFAULT TRUE,
  enable_pending_approval BOOLEAN DEFAULT TRUE,
  enable_due_date_alerts BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT FALSE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  push_notifications BOOLEAN DEFAULT TRUE,
  overdue_payment_threshold_days INTEGER DEFAULT 1,
  low_inventory_threshold_percent INTEGER DEFAULT 20,
  high_debt_threshold_percent INTEGER DEFAULT 90, -- Changed to INTEGER for consistency
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  organization_id UUID REFERENCES public.organizations(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50),
  organization_id UUID REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ================================================================
-- 2.5 التقارير واللوحات البرمجية (Views)
-- ================================================================
DROP VIEW IF EXISTS public.monthly_sales_dashboard CASCADE;
CREATE OR REPLACE VIEW public.monthly_sales_dashboard WITH (security_invoker = true) AS
 SELECT 
    jl.id,
    je.transaction_date,
    (jl.credit - jl.debit) AS amount,
    CASE 
        WHEN a.code = '411' THEN 'Wholesale'
        WHEN a.code LIKE '4111%' OR a.code LIKE '4112%' THEN 'Restaurant'
        WHEN a.code LIKE '412%' THEN 'Returns'
        ELSE 'Other Revenue'
    END as sales_type,
    je.organization_id
 FROM public.journal_lines jl
 JOIN public.journal_entries je ON jl.journal_entry_id = je.id
 JOIN public.accounts a ON jl.account_id = a.id
 WHERE je.status = 'posted' AND (a.type ILIKE '%revenue%' OR a.code LIKE '4%');

-- ملاحظة: استخدام security_invoker يضمن أن الـ View يحترم سياسات RLS الخاصة بالجداول الأصلية

-- 🚀 ملف الماستر انتهى هيكلياً. الرصيد والدوال في deploy_all_functionss والسياسات في setup_rls.

-- ================================================================
-- 