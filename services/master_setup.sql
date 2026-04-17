-- 🌟 ملف التأسيس الشامل (Master Setup) - TriPro ERP
-- 📅 تاريخ التحديث: 2026-04-08 (نسخة الإنتاج المطورة - SaaS Optimized)
-- ℹ️ الوصف: يقوم هذا الملف بإنشاء قاعدة البيانات بالكامل (الجداول، الدوال، الإخطارات، الحسابات، الحماية) دفعة واحدة.
-- ⚠️ تحذير: تشغيل هذا الملف سيقوم بمسح جميع البيانات الموجودة في قاعدة البيانات!

-- ================================================================
-- 0. تنظيف وإعداد المخطط (Reset Schema)
-- ================================================================
-- ⚠️ تم إيقاف المسح الكامل للمخطط لسلامة بيئة SaaS
-- في حال الرغبة في مسح شامل، قم بتشغيل DROP SCHEMA public CASCADE يدوياً مرة واحدة فقط.
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

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
    allowed_modules text[] DEFAULT '{"accounting"}',
    is_active boolean DEFAULT true,
    subscription_expiry date,
    max_users integer DEFAULT 5,
    suspension_reason text,
    total_collected numeric DEFAULT 0,
    next_payment_date date,
    activity_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الحماية المساعدة (Security Helpers) - يجب أن تكون في البداية
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'role')::text;
    -- 2. Fallback to auth.users (avoids recursion on public.profiles)
    RETURN COALESCE(_role, (SELECT (raw_user_meta_data->>'role')::text FROM auth.users WHERE id = (nullif(current_setting('request.jwt.auth.uid', true), '')::uuid)));
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- توحيد منطق الهوية لمنع تضارب الأرصدة في بيئة SaaS
    RETURN COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid,
        (SELECT (raw_user_meta_data->>'org_id')::uuid FROM auth.users WHERE id = auth.uid() LIMIT 1)
    );
END; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (public.get_my_role() IN ('super_admin', 'admin'));
END; $$;

-- الصلاحيات والمستخدمين
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
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
INSERT INTO public.permissions (module, action, description) VALUES
('sales', 'view', 'عرض المبيعات'),
('sales', 'create', 'إنشاء فاتورة مبيعات'),
('sales', 'update', 'تعديل فاتورة مبيعات'),
('sales', 'delete', 'حذف فاتورة مبيعات'),
('sales', 'approve', 'اعتماد الفواتير'),
('purchases', 'view', 'عرض المشتريات'),
('purchases', 'create', 'إنشاء فاتورة مشتريات'),
('purchases', 'update', 'تعديل فاتورة مشتريات'),
('purchases', 'delete', 'حذف فاتورة مشتريات'),
('products', 'view', 'عرض المنتجات'),
('products', 'create', 'إضافة منتجات'),
('products', 'update', 'تعديل منتجات'),
('products', 'delete', 'حذف منتجات'),
('inventory', 'view', 'عرض المخزون والتقارير'),
('inventory', 'manage', 'إدارة تسويات المخازن'),
('hr', 'view', 'عرض الموظفين'),
('hr', 'manage', 'إدارة الرواتب'),
('accounting', 'view', 'عرض القيود والتقارير'),
('accounting', 'create', 'إنشاء قيود محاسبية'),
('accounting', 'update', 'تعديل القيود المحاسبية'),
('accounting', 'delete', 'حذف القيود المحاسبية'),
('accounting', 'post', 'ترحيل القيود المحاسبية'),
('treasury', 'view', 'عرض الخزينة'),
('treasury', 'create', 'إنشاء سندات'),
('treasury', 'update', 'تعديل سندات'),
('treasury', 'manage', 'إدارة الخزينة'),
('restaurant', 'manage', 'إدارة المطعم'),
('admin', 'manage', 'إدارة الصلاحيات')
ON CONFLICT (module, action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_invitation record;
BEGIN
    -- 1. جلب البيانات من Metadata
    v_org_id := (new.raw_user_meta_data->>'org_id')::uuid;
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');

    -- 2. تأمين حالة المنظمة للمستخدم الأول في النظام
    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    -- 3. التحقق من الدعوات إذا لم يوجد معرف شركة في الـ Metadata
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations 
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;

        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    -- 4. ضمان تعيين دور admin إذا كان المستخدم هو أول من ينضم لمنظمة موجودة
    IF v_org_id IS NOT NULL AND v_role IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE organization_id = v_org_id) THEN
            v_role := 'admin';
        END IF;
    END IF;

    -- 5. إذا كان المستخدم سوبر أدمن، نضمن عدم ربطه بمنظمة محددة ليبقى عالمياً
    IF v_role = 'super_admin' THEN
        v_org_id := NULL;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, role_id, organization_id)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'), 
        v_role, 
        (SELECT id FROM public.roles WHERE organization_id = v_org_id AND name = COALESCE(v_role, 'admin') LIMIT 1),
        v_org_id
    )
    ON CONFLICT (id) DO NOTHING;

    -- تأكيد تحديث Metadata في auth.users لضمان توفرها في الـ JWT فوراً
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object('role', v_role) || 
        CASE 
            WHEN v_org_id IS NOT NULL THEN jsonb_build_object('org_id', v_org_id)
            ELSE '{}'::jsonb
        END
    WHERE id = new.id;

    RETURN new;
END;
$$;

-- إنشاء التريجر ليربط مع نظام الحماية الخاص بـ Supabase (auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ⚡ دالة التأسيس التلقائي للمنظمات الجديدة (Auto-Setup)
CREATE OR REPLACE FUNCTION public.handle_new_organization_setup()
RETURNS TRIGGER AS $$
DECLARE 
    v_role_id uuid;
    v_warehouse_id uuid;
    v_treasury_id uuid;
BEGIN
    -- 1. إنشاء دور "مدير النظام" للشركة الجديدة
    INSERT INTO public.roles (name, description, organization_id)
    VALUES ('admin', 'مدير النظام - كامل الصلاحيات', NEW.id)
    RETURNING id INTO v_role_id;

    -- 2. ربط كافة الصلاحيات بهذا الدور
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT v_role_id, id, NEW.id
    FROM public.permissions;

    -- 3. 🚀 الاستدعاء السحري: تنفيذ التأسيس المحاسبي الكامل أوتوماتيكياً
    -- سيقوم هذا السطر بإنشاء المخزن والخزينة وشجرة الحسابات والربط بالنشاط
    PERFORM public.initialize_egyptian_coa(NEW.id, COALESCE(NEW.activity_type, 'commercial'), NULL);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ في حال فشل تأسيس الصلاحيات للشركة الجديدة
    INSERT INTO public.system_error_logs (error_message, error_code, function_name, organization_id, context)
    VALUES (SQLERRM, SQLSTATE, 'handle_new_organization_setup', NEW.id, jsonb_build_object('org_name', NEW.name));
    RAISE; -- إعادة إلقاء الخطأ ليتوقف النظام ويظهر التنبيه للمستخدم
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط الدالة بجدول المنظمات
DROP TRIGGER IF EXISTS trg_setup_new_org ON public.organizations;
CREATE TRIGGER trg_setup_new_org
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_organization_setup();

-- دالة التحقق من عدد المستخدمين (منع تجاوز حدود الباقة)
CREATE OR REPLACE FUNCTION public.check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users integer;
    v_current_users integer;
BEGIN
    -- 0. استثناء السوبر أدمن من الفحص (سواء كان هو المضيف أو المستخدم المضاف)
    IF public.get_my_role() = 'super_admin' OR NEW.role = 'super_admin' THEN
        RETURN NEW;
    END IF;

    -- 1. جلب الحد الأقصى المسموح به لهذه الشركة
    SELECT max_users INTO v_max_users FROM public.organizations WHERE id = NEW.organization_id;
    
    -- 2. حساب عدد المستخدمين الحاليين (باستثناء السوبر أدمن)
    SELECT count(*) INTO v_current_users FROM public.profiles 
    WHERE organization_id = NEW.organization_id AND role != 'super_admin';

    -- 3. التحقق من التجاوز
    IF v_current_users >= COALESCE(v_max_users, 5) THEN
        RAISE EXCEPTION '⚠️ عذراً، لقد وصلت للحد الأقصى للمستخدمين المسموح بهم في باقتك الحالية (%). يرجى ترقية الباقة لإضافة المزيد.', v_max_users;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_limit_users ON public.profiles;
CREATE TRIGGER trg_limit_users
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_user_limit();

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
    account_mappings jsonb DEFAULT '{}'::jsonb,
    default_warehouse_id uuid, -- عمود لربط المستودع الافتراضي
    default_treasury_id uuid,  -- عمود لربط الخزينة الافتراضية
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
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    related_document_id uuid,
    related_document_type text,
    created_at timestamptz DEFAULT now() NOT NULL,
    transaction_date date,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0,
    credit numeric(19,4) DEFAULT 0,
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
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
    type text DEFAULT 'warehouse',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text
);

-- تصنيفات الأصناف (موجود في الهيكل الحالي)
CREATE TABLE IF NOT EXISTS public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar NOT NULL,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id), -- Changed to uuid for consistency
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    barcode text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    description text,
    cost numeric DEFAULT 0,
    manufacturing_cost numeric DEFAULT 0, -- عمود جديد
    opening_balance numeric DEFAULT 0, -- الرصيد الافتتاحي (كمية)
    weighted_average_cost numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    unit text, -- وحدة القياس (قطعة، كيلو، إلخ)
    min_stock numeric DEFAULT 5,
    min_stock_level numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK',
    product_type text DEFAULT 'STOCK', -- إضافة هذا العمود لتوافق الواجهة الأمامية
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    category_id uuid REFERENCES public.item_categories(id),
    expiry_date date,
    available_modifiers jsonb DEFAULT '[]'::jsonb, -- إضافات الأصناف المتاحة (مثل: إضافات البيتزا أو ملاحظات المطبخ)
    
    -- حقول العروض
    offer_price numeric,
    offer_start_date date,
    offer_end_date date,
    offer_max_qty numeric,
    
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    labor_cost numeric(19,4) DEFAULT 0,
    overhead_cost numeric(19,4) DEFAULT 0,
    is_overhead_percentage boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    quantity_required numeric NOT NULL DEFAULT 1
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
    paid_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text, -- draft, posted, paid, partial
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    approver_id uuid REFERENCES auth.users(id), -- عمود جديد
    reference text, -- عمود جديد
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    discount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    custom_fields jsonb, -- Changed to jsonb for consistency
    cost numeric DEFAULT 0, -- Cost at time of sale
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.sales_returns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number text,
    original_invoice_id uuid REFERENCES public.invoices(id),
    customer_id uuid REFERENCES public.customers(id),
    return_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    notes text,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id), -- Changed to uuid for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    status text,
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    additional_expenses numeric DEFAULT 0, -- عمود جديد
    approver_id uuid REFERENCES auth.users(id),
    reference text,
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number text,
    original_invoice_id uuid REFERENCES public.purchase_invoices(id),
    supplier_id uuid REFERENCES public.suppliers(id),
    return_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    notes text,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id), -- Changed to uuid for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.quotations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid REFERENCES public.profiles(id),
    quotation_date date,
    expiry_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    status text DEFAULT 'draft', -- draft, sent, accepted, rejected, converted
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric, -- توحيد المسمى مع باقي النظام
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text, -- تم توحيد المسمى ليتوافق مع نظام الطلبات
    supplier_id uuid REFERENCES public.suppliers(id),
    order_date date,
    delivery_date date,
    total_amount numeric,
    tax_amount numeric,
    status text DEFAULT 'draft',
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE, -- توحيد المسمى ليتوافق مع نظام الطلبات
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric, -- توحيد المسمى مع باقي النظام
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- السندات والشيكات
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    type text DEFAULT 'receipt', -- receipt, deposit
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id), -- Changed to uuid for consistency
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    payment_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    recipient_name text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cheques (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_number text,
    bank_name text,
    amount numeric,
    due_date date,
    status text DEFAULT 'pending', -- received, deposited, collected, rejected, issued, cashed
    type text, -- incoming, outgoing
    party_id uuid, -- Customer or Supplier ID
    party_name text,
    notes text,
    transfer_account_number text,
    transfer_bank_name text,
    transfer_date date,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    related_voucher_id uuid,
    organization_id uuid REFERENCES public.organizations(id),
    current_account_id uuid REFERENCES public.accounts(id), -- عمود جديد
    created_at timestamptz DEFAULT now()
);

-- جداول إضافية (مرفقات، إقفال، إشعارات)
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
    customer_id uuid REFERENCES public.customers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_note_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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

-- الأصول الثابتة
CREATE TABLE IF NOT EXISTS public.assets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    purchase_date date,
    purchase_cost numeric,
    salvage_value numeric,
    useful_life numeric,
    current_value numeric,
    asset_account_id uuid REFERENCES public.accounts(id),
    accumulated_depreciation_account_id uuid REFERENCES public.accounts(id),
    depreciation_expense_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'active',
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name text NOT NULL,
    position text,
    department text,
    phone text,
    email text,
    salary numeric, -- basic salary
    hire_date date,
    status text DEFAULT 'active',
    notes text, -- Changed to text for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payrolls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_month integer,
    payroll_year integer,
    payment_date date DEFAULT CURRENT_DATE,
    total_gross_salary numeric,
    total_additions numeric,
    total_deductions numeric,
    total_net_salary numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'draft',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_id uuid REFERENCES public.payrolls(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id),
    gross_salary numeric,
    additions numeric,
    payroll_tax numeric DEFAULT 0, -- عمود ضريبة كسب العمل
    advances_deducted numeric,
    other_deductions numeric,
    net_salary numeric, -- Changed to numeric for consistency
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id),
    amount numeric,
    request_date date,
    status text DEFAULT 'pending', -- pending, approved, paid, deducted
    notes text,
    reference text,
    treasury_account_id uuid REFERENCES public.accounts(id), -- Changed to uuid for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    payroll_item_id uuid REFERENCES public.payroll_items(id),
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 2.4 جداول نظام المطاعم (Restaurant Module)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    capacity integer DEFAULT 4,
    status text DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, RESERVED
    section text,
    reservation_info jsonb,
    qr_access_key uuid DEFAULT gen_random_uuid(),
    qr_code text, -- Changed to text for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    opened_by uuid REFERENCES auth.users(id),
    customer_name text,
    opened_at timestamptz DEFAULT now(),
    closed_at timestamptz, -- Changed to timestamptz for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    status text DEFAULT 'OPEN' -- OPEN, CLOSED
);

CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    opening_balance numeric,
    closing_balance numeric,
    expected_cash numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    difference numeric DEFAULT 0,
    notes text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    status text DEFAULT 'OPEN' -- OPEN, CLOSED
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id),
    order_type text, -- DINEIN, TAKEAWAY, DELIVERY
    status text DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED, PAID
    notes text,
    subtotal numeric DEFAULT 0,
    total_tax numeric DEFAULT 0, -- Changed to numeric for consistency
    total_discount numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    warehouse_id uuid REFERENCES public.warehouses(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id), -- 🛡️ العمود المفقود لربط القيود
    user_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    total_price numeric NOT NULL,
    unit_cost numeric DEFAULT 0,
    notes text,
    modifiers jsonb DEFAULT '[]'::jsonb,
    vat_rate numeric DEFAULT 0.14,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW', -- NEW, PREPARING, READY, SERVED
    status_updated_at timestamptz DEFAULT now(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name text,
    customer_phone text,
    delivery_address text,
    delivery_fee numeric DEFAULT 0,
    status text DEFAULT 'PENDING', -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_method text, -- CASH, CARD, WALLET
    amount numeric NOT NULL,
    status text DEFAULT 'COMPLETED', -- COMPLETED, REFUNDED
    transaction_ref text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- نظام الإضافات (Advanced Modifiers)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    selection_type TEXT NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')) DEFAULT 'MULTIPLE',
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selection INT NOT NULL DEFAULT 0,
    max_selection INT,
    display_order INT DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false,
    display_order INT DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    price_at_order NUMERIC(10, 2) NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    PRIMARY KEY (order_item_id, modifier_id)
);  

-- جدول صلاحيات المستخدمين المباشرة (موجود في الهيكل)
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id),
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    has_permission boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- عمليات المخزون المتقدمة
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_number text,
    from_warehouse_id uuid REFERENCES public.warehouses(id),
    to_warehouse_id uuid REFERENCES public.warehouses(id),
    transfer_date date,
    status text,
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    adjustment_date date,
    status text,
    reason text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric, -- الموجب زيادة، السالب عجز
    type text, -- in / out
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    count_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    count_date date,
    status text,
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_count_id uuid REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id),
    system_qty numeric,
    actual_qty numeric,
    difference numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- التصنيع (Manufacturing)
CREATE TABLE IF NOT EXISTS public.work_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text,
    product_id uuid REFERENCES public.products(id),
    warehouse_id uuid REFERENCES public.warehouses(id),
    quantity numeric,
    start_date date,
    end_date date,
    status text DEFAULT 'draft', -- draft, in_progress, completed, cancelled -- Changed to text for consistency
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.work_order_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
    cost_type text, -- labor, overhead, other
    amount numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    description text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id uuid REFERENCES public.accounts(id),
    statement_date date,
    statement_balance numeric,
    book_balance numeric,
    opening_balance numeric,
    total_deposits numeric,
    total_payments numeric,
    reconciled_ids jsonb, -- Array of reconciled transaction IDs
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text, -- balanced, unbalanced
    notes text,
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 2. نظام الإخطارات (Notifications)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500), -- Changed to VARCHAR for consistency
  related_id VARCHAR(100),
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
CREATE OR REPLACE VIEW public.monthly_sales_dashboard WITH (security_invoker = true) AS
 -- 🛡️ تم التحديث ليعتمد على الحسابات المالية لضمان الدقة وتطابق التقارير
 SELECT 
    jl.id,
    je.transaction_date,
    (jl.credit - jl.debit) AS amount,
    -- جلب التكلفة من المستند المرتبط إذا وجد
    0 AS total_cost, 
    CASE 
        WHEN a.code LIKE '411%' THEN 'Sales'
        WHEN a.code LIKE '412%' THEN 'Returns'
        ELSE 'Other Revenue'
    END as type,
    je.organization_id
 FROM public.journal_lines jl
 JOIN public.journal_entries je ON jl.journal_entry_id = je.id
 JOIN public.accounts a ON jl.account_id = a.id
 WHERE je.status = 'posted' AND (a.type ILIKE '%revenue%' OR a.code LIKE '4%');

-- ملاحظة: استخدام security_invoker يضمن أن الـ View يحترم سياسات RLS الخاصة بالجداول الأصلية

-- ================================================================
-- دالة تحديث كاش النظام (Refresh Supabase Schema Cache)
-- هذه الدالة ضرورية لحل مشكلة "Function not found" أو "Column not found" بعد تحديث الدوال أو الجداول
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- الأمر السحري لإعادة تحميل كاش الـ API (Schema Reload)
    EXECUTE 'NOTIFY pgrst, ''reload config''';
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
END; $$;

-- ================================================================
-- مراقب تحديث حالة طلبات المطبخ
-- ================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_update_kitchen_status_time()
RETURNS TRIGGER AS $t$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.status_updated_at = now();
    END IF;
    RETURN NEW;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kitchen_status_time ON public.kitchen_orders;
CREATE TRIGGER trg_kitchen_status_time
BEFORE UPDATE ON public.kitchen_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_update_kitchen_status_time();

-- تنفيذ التحديث فوراً لضمان التعرف على عمود product_type الجديد
SELECT public.refresh_saas_schema();

-- ================================================================
-- نظام حساب تكلفة الوجبات التلقائي بناءً على المكونات (BOM)
-- ================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_sync_meal_cost() RETURNS TRIGGER AS $t$
BEGIN
    UPDATE public.products
    SET cost = (
        SELECT COALESCE(SUM(bom.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0)
        FROM public.bill_of_materials bom
        JOIN public.products ing ON bom.raw_material_id = ing.id
        WHERE bom.product_id = COALESCE(NEW.product_id, OLD.product_id)
    )
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    RETURN NULL;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meal_cost_sync ON public.bill_of_materials;
CREATE TRIGGER trg_meal_cost_sync 
AFTER INSERT OR UPDATE OR DELETE ON public.bill_of_materials
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_meal_cost();

-- ================================================================
-- دوال إدارة الورديات (Shift Management)
-- ================================================================

-- دالة بدء الوردية
CREATE OR REPLACE FUNCTION public.start_shift(p_user_id uuid, p_opening_balance numeric, p_resume_existing boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_existing_shift_id UUID; v_new_shift_id UUID;
BEGIN
    SET search_path = public;
    SELECT id INTO v_existing_shift_id FROM public.shifts WHERE user_id = p_user_id AND end_time IS NULL LIMIT 1;
    IF v_existing_shift_id IS NOT NULL AND p_resume_existing THEN RETURN v_existing_shift_id; END IF;
    IF v_existing_shift_id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم'; END IF;
    INSERT INTO public.shifts (user_id, start_time, opening_balance, organization_id)
    VALUES (p_user_id, now(), p_opening_balance, public.get_my_org()) RETURNING id INTO v_new_shift_id;
    RETURN v_new_shift_id;
END; $$;

-- ================================================================
-- 3.7 صيانة وتحديث الأرصدة (Balance Maintenance)
-- ================================================================

-- 🛡️ دالة احتساب متوسط التكلفة المرجح (WAC) السيادية
CREATE OR REPLACE FUNCTION public.calculate_product_wac(p_product_id UUID, p_org_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_qty NUMERIC := 0; v_val NUMERIC := 0;
    v_ret_qty NUMERIC := 0; v_ret_val NUMERIC := 0;
    v_wastage_qty NUMERIC := 0;
BEGIN
    -- 1. وعاء المشتريات (الافتتاحي + الفواتير)
    SELECT 
        (COALESCE(p.opening_balance, 0) + COALESCE(SUM(pii.quantity), 0)),
        (COALESCE(p.opening_balance * p.purchase_price, 0) + COALESCE(SUM(pii.quantity * pii.unit_price * COALESCE(pi.exchange_rate, 1)), 0))
    INTO v_qty, v_val
    FROM public.products p
    LEFT JOIN public.purchase_invoice_items pii ON pii.product_id = p.id
    LEFT JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id AND pi.status IN ('posted', 'paid')
    WHERE p.id = p_product_id AND p.organization_id = p_org_id
    GROUP BY p.id, p.opening_balance, p.purchase_price;

    -- 2. خصم المرتجعات (تخصم الكمية والقيمة لتقليل وعاء التكلفة)
    SELECT COALESCE(SUM(pri.quantity), 0), COALESCE(SUM(pri.total), 0)
    INTO v_ret_qty, v_ret_val
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.organization_id = p_org_id AND pr.status = 'posted';
    -- 3. إضافة مرتجعات المبيعات (تزيد الكمية والقيمة في الوعاء)
    SELECT COALESCE(SUM(sri.quantity), 0), COALESCE(SUM(sri.quantity * COALESCE(ii.cost, p.weighted_average_cost, 0)), 0)
    INTO v_sales_ret_qty, v_sales_ret_val
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
    JOIN public.products p ON sri.product_id = p.id
    LEFT JOIN public.invoice_items ii ON sr.original_invoice_id = ii.invoice_id AND sri.product_id = ii.product_id
    WHERE sri.product_id = p_product_id AND sr.organization_id = p_org_id AND sr.status = 'posted';

        -- 4. خصم كميات الهالك (تخصم الكمية فقط لتوزيع التكلفة على المتبقي)

    SELECT COALESCE(SUM(sai.quantity), 0)
    INTO v_wastage_qty
    FROM public.stock_adjustment_items sai
    JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
    WHERE sai.product_id = p_product_id AND sa.organization_id = p_org_id AND sa.status = 'posted' AND (sa.reason ILIKE '%wastage%' OR sa.reason ILIKE '%هالك%');

    -- الحساب النهائي المطور: (المشتريات - مرتجع مشتريات + مرتجع مبيعات) / (كمية المشتريات - مرتجع مشتريات + مرتجع مبيعات - الهالك)
    IF (v_qty - v_ret_qty + v_sales_ret_qty - v_wastage_qty) > 0 THEN 
        RETURN ROUND((v_val - v_ret_val + v_sales_ret_val) / (v_qty - v_ret_qty + v_sales_ret_qty - v_wastage_qty), 4);
    ELSE 
        RETURN (SELECT COALESCE(purchase_price, 0) FROM public.products WHERE id = p_product_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تحديث رصيد العميل الواحد (مدين - دائن)
-- 🛡️ تحديث: دالة جلب الرصيد الموحدة (المتوافقة مع نظام الاستقرار)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id UUID, p_org_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_total NUMERIC := 0;
BEGIN
    -- 1. الرصيد الافتتاحي من العمود (بداية الحساب)
    SELECT COALESCE(opening_balance, 0) INTO v_total
    FROM public.customers WHERE id = p_customer_id;

    -- 2. المدين: الفواتير (نستبعد فواتير الرصيد الافتتاحي OB لمنع التكرار مع العمود)
    SELECT v_total + COALESCE(SUM(total_amount), 0) INTO v_total
    FROM public.invoices 
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
    AND status != 'draft' AND invoice_number NOT LIKE 'OB-%';

    -- 3. المدين: طلبات المطاعم
    SELECT v_total + COALESCE(SUM(subtotal + total_tax), 0) INTO v_total
    FROM public.orders WHERE customer_id = p_customer_id AND organization_id = p_org_id AND status != 'CANCELLED';
    
    -- 4. الدائن: سندات القبض
    SELECT v_total - COALESCE(SUM(amount), 0) INTO v_total
    FROM public.receipt_vouchers WHERE customer_id = p_customer_id AND organization_id = p_org_id AND voucher_number NOT LIKE 'DEP-%';

    -- 5. الدائن: مرتجعات المبيعات والإشعارات
    SELECT v_total - COALESCE(SUM(total_amount), 0) INTO v_total
    FROM public.sales_returns WHERE customer_id = p_customer_id AND organization_id = p_org_id AND status = 'posted';
    SELECT v_total - COALESCE(SUM(total_amount), 0) INTO v_total
    FROM public.credit_notes WHERE customer_id = p_customer_id AND organization_id = p_org_id AND status = 'posted';

    -- 6. الدائن: الشيكات الواردة (مطابقة لكشف الحساب: كل شيء ما عدا المرفوض)
    SELECT v_total - COALESCE(SUM(amount), 0) INTO v_total
    FROM public.cheques WHERE party_id = p_customer_id AND organization_id = p_org_id AND type = 'incoming' AND status != 'rejected';

    -- 7. القيود اليدوية: نأخذ فقط القيود التي ليس لها مستند مرتبط وغير تابعة للرصيد الافتتاحي
    SELECT v_total + COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_total
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = p_org_id 
    AND je.status = 'posted'
    AND je.related_document_id IS NULL 
    AND je.reference NOT LIKE 'OB-%'
    AND a.code LIKE '1221%';

    RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🛡️ مشغل التزامن التلقائي (لضمان عمل الرصيد في الماستر سيت أب)
CREATE OR REPLACE FUNCTION public.sync_customer_balance_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.customers SET balance = get_customer_balance(OLD.customer_id, OLD.organization_id) WHERE id = OLD.customer_id;
        RETURN OLD;
    ELSE
        UPDATE public.customers SET balance = get_customer_balance(NEW.customer_id, NEW.organization_id) WHERE id = NEW.customer_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تحديث رصيد المورد الواحد
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_balance numeric := 0;
BEGIN
    -- فواتير (دائن) - سندات (مدين) - مرتجعات (مدين) - إشعارات مدينة (مدين)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_balance FROM public.purchase_invoices WHERE supplier_id = p_supplier_id AND status != 'draft';
    SELECT v_balance - COALESCE((SELECT SUM(amount) FROM public.payment_vouchers WHERE supplier_id = p_supplier_id), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.purchase_returns WHERE supplier_id = p_supplier_id AND status = 'posted'), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.debit_notes WHERE supplier_id = p_supplier_id AND status = 'posted'), 0) INTO v_balance;

    UPDATE public.suppliers SET balance = v_balance WHERE id = p_supplier_id;
END; $$;

-- تحديث رصيد المخزن لصنف معين
CREATE OR REPLACE FUNCTION public.update_product_stock(p_product_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_stock numeric := 0;
BEGIN
    -- (الرصيد الافتتاحي في جدول المنتجات + كميات جدول أرصدة أول المدة + وارد مشتريات + مرتجع مبيعات) - (صادر مبيعات + مرتجع مشتريات) +/- تسويات
    SELECT COALESCE((SELECT opening_balance FROM public.products WHERE id = p_product_id), 0) +
           COALESCE((SELECT SUM(quantity) FROM public.opening_inventories WHERE product_id = p_product_id), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id WHERE pii.product_id = p_product_id AND pi.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock - COALESCE((SELECT SUM(quantity) FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id WHERE ii.product_id = p_product_id AND i.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = p_product_id AND sr.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id WHERE pri.product_id = p_product_id AND pr.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(CASE WHEN type = 'in' THEN quantity WHEN type = 'out' THEN -quantity ELSE 0 END) FROM public.stock_adjustment_items sai JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id WHERE sai.product_id = p_product_id AND sa.status != 'draft'), 0) INTO v_stock;

    UPDATE public.products SET stock = v_stock WHERE id = p_product_id;
END; $$;

-- إضافة منتج مع رصيد افتتاحي وقيد محاسبي آلي
DROP FUNCTION IF EXISTS public.add_product_with_opening_balance(text, text, text, text, numeric, numeric, numeric, text, uuid, uuid, text, uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(
    p_name text,
    p_sku text,
    p_barcode text,
    p_description text,
    p_sales_price numeric,
    p_purchase_price numeric,
    p_stock numeric,
    p_unit text,
    p_category_id uuid, -- معلمة جديدة للتصنيف
    p_org_id uuid,
    p_item_type text,
    p_inventory_account_id uuid,
    p_cogs_account_id uuid,
    p_sales_account_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_product_id uuid;
    v_entry_id uuid;
    v_opening_account_id uuid;
    v_total_value numeric;
BEGIN
    -- 1. حساب القيمة الإجمالية للمخزون الافتتاحي
    v_total_value := p_stock * p_purchase_price;

    -- 2. إدراج المنتج
    INSERT INTO public.products (name, sku, barcode, description, sales_price, purchase_price, stock, opening_balance, unit, category_id, organization_id, item_type, product_type, inventory_account_id, cogs_account_id, sales_account_id)
    VALUES (p_name, p_sku, p_barcode, p_description, p_sales_price, p_purchase_price, p_stock, p_stock, p_unit, p_category_id, p_org_id, p_item_type, p_item_type, p_inventory_account_id, p_cogs_account_id, p_sales_account_id)
    RETURNING id INTO v_product_id;

    -- 3. إنشاء القيد المحاسبي إذا كانت القيمة أكبر من صفر
    IF v_total_value > 0 THEN
        -- جلب حساب الأرصدة الافتتاحية (كود 3999)
        SELECT id INTO v_opening_account_id FROM public.accounts WHERE code = '3999' AND organization_id = p_org_id LIMIT 1;
        
        IF v_opening_account_id IS NOT NULL AND p_inventory_account_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, reference, description, status, organization_id, related_document_id, related_document_type)
            VALUES (now(), 'OB-' || p_sku, 'إثبات رصيد افتتاحي للمنتج: ' || p_name, 'posted', p_org_id, v_product_id, 'product')
            RETURNING id INTO v_entry_id;

            -- سطر المدين: حساب المخزون
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_entry_id, p_inventory_account_id, v_total_value, 0, 'رصيد افتتاحي مخزني', p_org_id);

            -- سطر الدائن: حساب الأرصدة الافتتاحية
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_entry_id, v_opening_account_id, 0, v_total_value, 'مقابل رصيد افتتاحي مخزني', p_org_id);
        END IF;
    END IF;

    RETURN v_product_id;
END; $$;

-- ================================================================
-- 4. البيانات الأولية (Seeding)
-- ================================================================
DO $$ 
DECLARE 
    v_org_id uuid; v_cat_id uuid;
BEGIN
    INSERT INTO public.organizations (name) VALUES ('الشركة النموذجية للتجارة') RETURNING id INTO v_org_id;
    INSERT INTO public.company_settings (organization_id, company_name, currency, vat_rate) VALUES (v_org_id, 'الشركة النموذجية للتجارة', 'SAR', 0.15);
    INSERT INTO public.warehouses (organization_id, name) VALUES (v_org_id, 'المستودع الرئيسي');
    
    INSERT INTO public.accounts (organization_id, code, name, type, is_group) VALUES
    (v_org_id, '1', 'الأصول', 'ASSET', true),
    (v_org_id, '2', 'الخصوم', 'LIABILITY', true),
    (v_org_id, '3', 'حقوق الملكية', 'EQUITY', true),
    (v_org_id, '4', 'الإيرادات', 'REVENUE', true),
    (v_org_id, '5', 'المصروفات', 'EXPENSE', true);

    INSERT INTO public.roles (name, description) VALUES ('super_admin', 'المدير العام') ON CONFLICT DO NOTHING;
    INSERT INTO public.item_categories (organization_id, name) VALUES (v_org_id, 'عام') RETURNING id INTO v_cat_id;

    -- تحديث تكلفة الأصناف بناءً على BOM
    UPDATE public.products p SET cost = (
        SELECT COALESCE(SUM(bom.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0)
        FROM public.bill_of_materials bom JOIN public.products ing ON bom.raw_material_id = ing.id WHERE bom.product_id = p.id
    ) WHERE EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = p.id);
END $$;

-- ================================================================
-- 7. تفعيل نظام الحماية (RLS) الشامل
-- ================================================================

-- تفعيل RLS على جميع جداول النظام بدون استثناء
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'profiles', 'organizations', 'company_settings', 'roles', 'permissions', 'role_permissions', 'user_permissions',
        'accounts', 'cost_centers', 'journal_entries', 'journal_lines', 'journal_attachments', 'system_error_logs', 'kitchen_orders',
        'customers', 'suppliers', 'warehouses', 'item_categories', 'products', 'bill_of_materials', 'opening_inventories', 'modifier_groups', 'modifiers', 'order_item_modifiers',
        'invoices', 'invoice_items', 'sales_returns', 'sales_return_items', 'quotations', 'quotation_items',
        'purchase_invoices', 'purchase_invoice_items', 'purchase_returns', 'purchase_return_items', 'purchase_orders', 'purchase_order_items',
        'invitations', 'receipt_vouchers', 'payment_vouchers', 'receipt_voucher_attachments', 'payment_voucher_attachments', 'budgets',
        'cheques', 'cheque_attachments', 'cash_closings', 'rejected_cash_closings', 'credit_notes', 'debit_notes',
        'assets', 'employees', 'payrolls', 'payroll_items', 'employee_advances',
        'restaurant_tables', 'table_sessions', 'orders', 'order_items', 'payments',
        'stock_transfers', 'stock_transfer_items', 'stock_adjustments', 'stock_adjustment_items', 'inventory_counts', 'inventory_count_items',
        'work_orders', 'work_order_costs', 'bank_reconciliations', 'notifications', 'notification_preferences', 'notification_audit_log'
    ];
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- سياسات الوصول (Policies)
-- 1. Profiles
DROP POLICY IF EXISTS "profiles_select_safe" ON public.profiles;
CREATE POLICY "profiles_select_safe" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR organization_id = public.get_my_org());
DROP POLICY IF EXISTS "profiles_insert_safe" ON public.profiles;
CREATE POLICY "profiles_insert_safe" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update_safe" ON public.profiles;
CREATE POLICY "profiles_update_safe" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.get_my_role() IN ('admin', 'super_admin'));
DROP POLICY IF EXISTS "profiles_delete_safe" ON public.profiles;
CREATE POLICY "profiles_delete_safe" ON public.profiles FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'super_admin'));

-- 2. Organizations
DROP POLICY IF EXISTS "Users view own org" ON organizations;
CREATE POLICY "Users view own org" ON organizations FOR SELECT USING (id = get_my_org());
DROP POLICY IF EXISTS "Super admins view all organizations" ON organizations;
CREATE POLICY "Super admins view all organizations" ON organizations FOR SELECT TO authenticated USING (public.get_my_role() = 'super_admin');

-- سياسة الوصول لجدول الدعوات (فقط الأدمن يمكنه الإرسال)
DROP POLICY IF EXISTS "Admins manage invitations" ON invitations;
CREATE POLICY "Admins manage invitations" ON invitations FOR ALL USING (is_admin() AND organization_id = get_my_org());
-- 2. Settings
DROP POLICY IF EXISTS "Settings isolated by org" ON public.company_settings;
CREATE POLICY "Settings isolated by org" ON public.company_settings FOR SELECT TO authenticated USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS "Admins update settings" ON public.company_settings;
CREATE POLICY "Admins update settings" ON public.company_settings FOR UPDATE USING (public.is_admin() AND organization_id = public.get_my_org());

-- 3. البيانات الأساسية (Basic Data)
-- تكرار السياسة لجميع جداول التعريفات لضمان الحماية
DO $$ 
DECLARE 
    t text;
    basic_tables text[] := ARRAY['products', 'customers', 'suppliers', 'warehouses', 'accounts', 'cost_centers', 'item_categories', 'menu_categories', 'bill_of_materials', 'assets', 'restaurant_tables']; -- إضافة الطاولات هنا
BEGIN 
    FOREACH t IN ARRAY basic_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Policy_Select_%I" ON %I;', t, t);
        -- السماح للمشاهدين (QR) برؤية المنيو فقط
        IF t IN ('products', 'item_categories', 'menu_categories', 'bill_of_materials', 'restaurant_tables') THEN
            EXECUTE format('CREATE POLICY "Policy_Select_%I" ON %I FOR SELECT TO authenticated, anon USING (organization_id = public.get_my_org() OR auth.role() = ''anon'' OR public.get_my_role() = ''super_admin'');', t, t);
        ELSE
            -- حجب الحسابات والعملاء والموردين عن المشاهدين
            EXECUTE format('CREATE POLICY "Policy_Select_%I" ON %I FOR SELECT TO authenticated USING ((organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') AND get_my_role() NOT IN (''viewer'', ''demo''));', t, t);
        END IF;
        EXECUTE format('DROP POLICY IF EXISTS "Policy_Staff_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Policy_Staff_%I" ON %I FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager'', ''sales'', ''purchases'', ''accountant''));', t, t);
    END LOOP;
END $$;

-- 4. Transactions
-- تشمل الفواتير، السندات، القيود، وطلبات المطعم
DO $$ 
DECLARE 
    t text;
    trans_tables text[] := ARRAY[
        'invoices', 'invoice_items', 'purchase_invoices', 'purchase_invoice_items', 'journal_entries', 'journal_lines',
        'receipt_vouchers', 'payment_vouchers', 'orders', 'order_items', 'payments', 'table_sessions', 'delivery_orders', -- إضافة الجلسات والتوصيل
        'quotations', 'quotation_items', 'purchase_orders', 'purchase_order_items', -- إضافة جداول عروض الأسعار وأوامر الشراء هنا
        'sales_returns', 'sales_return_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'stock_transfers',
        'cheques', 'cash_closings', 'rejected_cash_closings', 'budgets', 'inventory_counts', 'inventory_count_items',
        'bank_reconciliations', 'credit_notes', 'debit_notes', 'kitchen_orders', 'work_orders', 'work_order_costs'
    ];
BEGIN 
    FOREACH t IN ARRAY trans_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Trans_Select_%I" ON %I;', t, t);
        -- حجب كافة المعاملات المالية (فواتير، قيود، رواتب) عن المشاهدين عبر الـ QR
        EXECUTE format('CREATE POLICY "Trans_Select_%I" ON %I FOR SELECT TO authenticated USING ((organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'') AND get_my_role() NOT IN (''viewer'', ''demo''));', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Trans_Staff_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Trans_Staff_%I" ON %I FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''));', t, t);
    END LOOP;
END $$;

-- 5. حماية بيانات الموارد البشرية والرواتب (HR & Payroll Security)
-- تمنع هذه السياسة المحاسبين والبائعين من رؤية تفاصيل الرواتب الحساسة
DO $$ 
DECLARE 
    t text;
    hr_tables text[] := ARRAY['employees', 'payrolls', 'payroll_items', 'employee_advances'];
BEGIN 
    FOREACH t IN ARRAY hr_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "HR_Select_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "HR_Select_%I" ON %I FOR SELECT TO authenticated USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager''));', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "HR_Staff_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "HR_Staff_%I" ON %I FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager''));', t, t);
    END LOOP;
END $$;

-- 5. Notifications (User specific)
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id AND organization_id = get_my_org());
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id AND organization_id = get_my_org());

-- 6. Security Logs (Insert for all, View for Admin)
DROP POLICY IF EXISTS "Everyone insert logs" ON security_logs;
CREATE POLICY "Everyone insert logs" ON security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by AND organization_id = get_my_org());
DROP POLICY IF EXISTS "Admins view logs" ON security_logs;
CREATE POLICY "Admins view logs" ON security_logs FOR SELECT USING (is_admin() AND organization_id = get_my_org());

-- 7. System Error Logs
DROP POLICY IF EXISTS "System insert error logs" ON system_error_logs;
CREATE POLICY "System insert error logs" ON system_error_logs FOR INSERT TO authenticated WITH CHECK (organization_id = get_my_org());
DROP POLICY IF EXISTS "Admins view error logs" ON system_error_logs;
CREATE POLICY "Admins view error logs" ON system_error_logs FOR SELECT USING (is_admin() AND organization_id = get_my_org());

-- 8. Roles & Permissions (Specific Policies)
-- صلاحيات قراءة جدول الصلاحيات العام للجميع
DROP POLICY IF EXISTS "Allow authenticated read permissions" ON public.permissions;
CREATE POLICY "Allow authenticated read permissions" ON public.permissions 
FOR SELECT TO authenticated USING (true);

-- حماية الأدوار: كل شركة ترى أدوارها فقط
DROP POLICY IF EXISTS "Allow users to view roles in their org" ON public.roles;
CREATE POLICY "Allow users to view roles in their org" ON public.roles 
FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow admins to manage roles in their org" ON public.roles;
CREATE POLICY "Allow admins to manage roles in their org" ON public.roles 
FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.is_admin());

-- حماية ربط الصلاحيات بالأدوار
DROP POLICY IF EXISTS "Allow users to view role permissions in their org" ON public.role_permissions;
CREATE POLICY "Allow users to view role permissions in their org" ON public.role_permissions 
FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow admins to manage role permissions in their org" ON public.role_permissions;
CREATE POLICY "Allow admins to manage role permissions in their org" ON public.role_permissions 
FOR ALL TO authenticated USING (organization_id = public.get_my_org() AND public.is_admin());

-- 🚀 تنشيط كاش النظام لضمان تعرف الـ API على الأعمدة الجديدة فوراً
SELECT public.refresh_saas_schema();
NOTIFY pgrst, 'reload config';
-- 📊 تقرير تحليل انحراف التكلفة بسبب الهالك
CREATE OR REPLACE VIEW public.vw_inventory_wastage_analysis AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.purchase_price as avg_purchase_price, -- متوسط سعر الشراء المسجل
    p.weighted_average_cost as actual_wac, -- التكلفة الفعلية (بعد تأثير الهالك)
    (p.weighted_average_cost - p.purchase_price) as cost_increase_per_unit, -- مقدار الزيادة في تكلفة الوحدة
    p.stock as current_stock,
    (p.stock * (p.weighted_average_cost - p.purchase_price)) as total_wastage_impact_value, -- إجمالي الأثر المالي للهالك على المخزون الحالي
    p.organization_id
FROM public.products p
WHERE p.weighted_average_cost > p.purchase_price;

COMMENT ON VIEW public.vw_inventory_wastage_analysis IS 'يوضح هذا التقرير مدى ارتفاع تكلفة الصنف عن سعر شرائه الأصلي نتيجة استبعاد الكميات الهالكة من وعاء التكلفة';
-- تم الانتهاء من إعداد قاعدة البيانات بالكامل! ✅
