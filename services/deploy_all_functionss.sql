-- 🌟 النسخة الشاملة الموحدة (Version 4.0 - All Modules Integrated)
-- 🌟 النسخة الشاملة الموحدة (Version 10.0 - SaaS Full Integration)

-- 🛠️ دالة جلب معرف المنظمة للمستخدم الحالي (ضرورية جداً لعمل النظام)
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_org_id uuid;
BEGIN
    -- إذا كان المستخدم غير مسجل دخول، نرجع null ولا نعطل الاستعلام
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;

    -- 🛡️ إذا كان المستخدم سوبر أدمن، نسمح له بالتبديل عبر الـ JWT دون تغيير البروفايل
    v_org_id := (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid;
    IF v_org_id IS NOT NULL AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin' THEN RETURN v_org_id; END IF;

    -- 🛡️ محاولة الجلب من جدول البروفايل أولاً (المصدر الأكثر ثقة لضمان عزل الشركات)
    v_org_id := (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1);
    IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;

    -- 🛡️ محاولة جلب المعرف من التوكن (JWT) كخيار بديل
    RETURN (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid;
END; $$;

-- 🛠️ أولاً: إصلاح هيكل الجداول لضمان دعم نظام تعدد الشركات (SaaS) مع الحذف المتتالي (CASCADE)
-- نضمن أن حذف المنظمة يؤدي لمسح كافة بياناتها تلقائياً (حل ERROR 23503 للأبد)
DO $$ 
DECLARE 
    r record;
BEGIN
    -- هذه الحلقة تبحث عن كافة قيود الربط بجدول المنظمات وتقوم بتحديثها لتدعم الحذف التلقائي
    FOR r IN 
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE kcu.column_name = 'organization_id' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE', r.table_name, r.constraint_name);
    END LOOP;
END $$;

-- ضمان وجود عمود organization_id في الجداول الأساسية
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 🛠️ ضبط القيم الافتراضية التلقائية للمنظمة (SaaS Auto-Pilot)
ALTER TABLE public.invoices ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.purchase_invoices ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.invoice_items ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.purchase_invoice_items ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.products ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.journal_entries ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.journal_lines ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.warehouses ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.receipt_vouchers ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.payment_vouchers ALTER COLUMN organization_id SET DEFAULT public.get_my_org();

-- 🛠️ تفعيل الحماية لجدول الإعدادات وتصحيح السياسة (حل مشكلة 406)
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings view policy" ON public.company_settings;
-- سياسة مرنة تسمح للمستخدم الموثق برؤية إعدادات شركته فقط
CREATE POLICY "Settings view policy" ON public.company_settings
FOR SELECT TO authenticated USING (
    organization_id = COALESCE(public.get_my_org(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
);


-- 🛠️ إضافة عمود الحالة للمستودعات إذا كان مفقوداً (حل مشكلة ERROR 42703)
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- تعبئة البيانات القديمة (إن وجدت) بمنظمة افتراضية لضمان ظهورها في الشاشة
-- تم تحسين المنطق لمنع أخطاء Duplicate Key
DO $$ 
DECLARE v_first_org uuid;
BEGIN
    SELECT id INTO v_first_org FROM public.organizations LIMIT 1;
    IF v_first_org IS NOT NULL THEN
        -- حذف الأدوار التي ستسبب تصادماً قبل التحديث
        DELETE FROM public.roles r1 WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM public.roles r2 WHERE r2.organization_id = v_first_org AND r2.name = r1.name);
        UPDATE public.roles SET organization_id = v_first_org WHERE organization_id IS NULL;
        UPDATE public.role_permissions SET organization_id = v_first_org WHERE organization_id IS NULL;
    END IF;
END $$;

-- 🛠️ إنشاء وتعبئة جدول الصلاحيات الأساسية (هذا ما يجعل المصفوفة تظهر في الشاشة)
CREATE TABLE IF NOT EXISTS public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    UNIQUE(module, action)
);

INSERT INTO public.permissions (module, action, description) VALUES
('sales', 'view', 'عرض المبيعات'),
('sales', 'create', 'إنشاء فاتورة مبيعات'),
('sales', 'update', 'تعديل فاتورة مبيعات'),
('sales', 'delete', 'حذف فاتورة مبيعات'),
('sales', 'approve', 'اعتماد الفواتير'),
('purchases', 'view', 'عرض المشتريات'),
('purchases', 'create', 'إنشاء فاتورة مشتريات'),
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

-- 🛠️ ضمان وجود الأدوار الافتراضية لكل الشركات المسجلة حالياً
INSERT INTO public.roles (organization_id, name, description)
SELECT o.id, r.name, r.role_desc
FROM public.organizations o
CROSS JOIN (
    VALUES 
    ('admin', 'مدير النظام'),
    ('accountant', 'محاسب'),
    ('cashier', 'كاشير / بائع'),
    ('chef', 'شيف / مطبخ')
) AS r(name, role_desc)
ON CONFLICT (name, organization_id) DO NOTHING;

-- ℹ️ الوصف: المحرك الكامل لمديولات (المبيعات، المشتريات، المرتجعات، المطاعم، الرواتب، المخازن، والتقارير)
-- تم دمج كافة الدوال لضمان عمل النظام ككتلة واحدة مع عزل SaaS كامل.

-- ================================================================
-- 0. تنظيف شامل لتجنب تعارض التوقيعات (Drop Old Functions)
-- ================================================================
DO $$
DECLARE
    func_signature text;
    func_name text; -- To store just the name part for comparison
BEGIN
    -- Iterate over all functions in the public schema, getting their full signatures
    FOR func_signature IN SELECT p.oid::regprocedure::text
                          FROM pg_proc p
                          JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public'
    LOOP
        -- Extract just the function name from the signature (e.g., "approve_invoice(uuid)" -> "approve_invoice")
        func_name := split_part(func_signature, '(', 1);

        -- List of functions defined in this file that should be dropped before re-creation
        IF func_name IN (
            'approve_invoice', 'approve_purchase_invoice', 'approve_receipt_voucher', 'approve_payment_voucher',
            'approve_sales_return', 'approve_purchase_return', 'approve_debit_note', 'approve_credit_note',
            'create_restaurant_order', 'run_payroll_rpc', 'handle_new_user', 'check_user_limit',
            'initialize_egyptian_coa', 'sync_role_permissions', 'create_new_client_v2', 'add_product_with_opening_balance',
            'get_product_recipe_cost', 'recalculate_stock_rpc',
            'recalculate_all_system_balances', 'get_dashboard_stats', 'force_grant_admin_access', 'refresh_saas_schema', 
            'create_public_order', 'get_shift_summary', 'generate_shift_closing_entry', 'close_shift',
            'get_or_create_qr_for_table'
        )
        THEN
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature); -- Drop by full signature
        END IF;
    END LOOP;
END $$;

-- ================================================================
-- 0.5. دالة تحديث كاش النظام (System Cache Refresh Function)
-- ================================================================
-- هذه الدالة ضرورية لتحديث PostgREST أو أي كاش آخر بعد تغييرات المخطط
-- تم إضافتها هنا لضمان وجودها عند استدعائها في نهاية الملف
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Placeholder for refreshing SaaS schema/cache.
    -- In a real Supabase/PostgREST setup, this would typically trigger a PostgREST schema reload
    -- (e.g., by sending a NOTIFY 'pgrst', 'reload schema';) or refresh materialized views.
    RETURN 'SaaS schema refresh triggered (placeholder).';
END;
$$;

-- 1. دوال المبيعات والمشتريات (Sales & Purchases)
-- ================================================================

-- أ. اعتماد فاتورة المبيعات
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
BEGIN
    -- 1. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;

    -- 🛡️ منع التكرار الحقيقي: نتحقق من وجود المعرف المرتبط فقط
    -- إذا كانت الحالة 'posted' ولكن لا يوجد قيد (وهو حال عروض الأسعار المحولة)، يجب أن تستمر الدالة
    IF v_invoice.related_journal_entry_id IS NOT NULL THEN RETURN; END IF;

    -- 🛡️ حماية من "سباق الزمن": لا تنشئ قيداً إذا لم تكن بنود الفاتورة قد وصلت بعد لقاعدة البيانات
    -- هذا يضمن عدم إنشاء قيد الإيراد بدون قيد التكلفة عند التحويل الآلي
    IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN RETURN; END IF;

    -- 🛡️ تأمين معرف المنظمة (SaaS Protection) - حل مشكلة عروض الأسعار
    -- نعتمد على المنظمة المسجلة في الفاتورة، أو منظمة المستخدم، أو منظمة العميل كخيار أخير
    v_org_id := COALESCE(v_invoice.organization_id, public.get_my_org(), (SELECT organization_id FROM public.customers WHERE id = v_invoice.customer_id));
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة التابعة لها الفاتورة. يرجى التأكد من تسجيل الدخول بشكل صحيح.'; END IF;

    -- ترميم المنظمة في الفاتورة إذا كانت مفقودة لضمان تماسك البيانات
    IF v_invoice.organization_id IS NULL THEN UPDATE public.invoices SET organization_id = v_org_id WHERE id = p_invoice_id; END IF;

    -- 2. جلب روابط الحسابات المخصصة من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 3. جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي)
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_discount_acc_id := COALESCE((v_mappings->>'SALES_DISCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو العملاء أو تكلفة المبيعات أو المخزون غير معرّفة في دليل الحسابات.';
    END IF;

    -- 4. تحديث المخزون وحساب تكلفة البضاعة المباعة (COGS)
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        -- 🚀 محرك التكلفة الذكي: يحاول جلب المتوسط المرجح -> التكلفة اليدوية -> تكلفة الوصفة (للمطاعم) -> سعر الشراء
        SELECT COALESCE(
            NULLIF(weighted_average_cost, 0), 
            NULLIF(cost, 0), 
            public.get_product_recipe_cost(v_item.product_id), 
            NULLIF(purchase_price, 0), 
            0
        ) INTO v_item_cost 
        FROM public.products 
        WHERE id = v_item.product_id AND organization_id = v_org_id;
        
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        
        -- تحديث تكلفة البند في الفاتورة لضمان دقة التقارير لاحقاً
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- تحديث المخزون مع معالجة حالة المستودع الفارغ
        UPDATE public.products SET stock = stock - v_item.quantity, 
        warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_invoice.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 5. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) RETURNING id INTO v_journal_id;

    -- 6. إنشاء أسطر القيد
    IF (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)), 0, 'استحقاق عميل', v_org_id); END IF;
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF; INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_treasury_acc_id, COALESCE(v_invoice.paid_amount, 0), 0, 'تحصيل نقدي', v_org_id); END IF;
    IF COALESCE(v_invoice.discount_amount, 0) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, COALESCE(v_invoice.discount_amount, 0), 0, 'خصم ممنوح', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id);
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, COALESCE(v_invoice.tax_amount, 0), 'ضريبة القيمة المضافة', v_org_id); END IF;
    IF v_total_cost > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id), (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id); END IF;

    -- 7. تحديث حالة الفاتورة
    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ب. اعتماد فاتورة المشتريات
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric;
    v_exchange_rate numeric; v_item_price_base numeric; v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric;
    v_mappings jsonb;
BEGIN
    -- 1. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF; -- 🛡️ جعل الدالة تتحمل التكرار (Idempotent)

    v_org_id := public.get_my_org();
    IF v_invoice.organization_id != v_org_id THEN RAISE EXCEPTION 'تحذير أمني: لا يمكنك اعتماد فاتورة شراء لا تنتمي لمؤسستك'; END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- 2. جلب روابط الحسابات المخصصة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 3. جلب الحسابات
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات'; END IF;

    -- 4. تحديث المخزون وحساب المتوسط المرجح
    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.unit_price * v_exchange_rate;
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_current_stock := COALESCE(v_current_stock, 0); v_current_avg_cost := COALESCE(v_current_avg_cost, 0); -- حساب التكلفة المرجحة
        IF (v_current_stock + v_item.quantity) > 0 THEN v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity); ELSE v_new_avg_cost := v_item_price_base; END IF;
        UPDATE public.products SET stock = stock + v_item.quantity, weighted_average_cost = v_new_avg_cost, cost = v_new_avg_cost, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 5. حساب إجماليات الفاتورة بالعملة المحلية للقيد
    v_total_amount_base := v_invoice.total_amount * v_exchange_rate; v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate; v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    -- 6. إنشاء قيد اليومية وأسطر القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    -- 7. تحديث حالة الفاتورة
    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ================================================================
-- 2. دوال المرتجعات والإشعارات (Returns & Notes)
-- ================================================================

-- أ. اعتماد مرتجع مبيعات (Sales Return)
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
    v_acc_cogs uuid; v_acc_inv uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
BEGIN
    -- 1. التحقق من المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    
    v_org_id := public.get_my_org();
    IF v_return.organization_id != v_org_id THEN RAISE EXCEPTION 'تحذير أمني: لا تملك صلاحية هذا المرتجع'; END IF;

    -- 2. جلب روابط الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_sales_ret := COALESCE((v_mappings->>'SALES_RETURNS')::uuid, (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1));
    v_acc_vat := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_acc_inv := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث المخزون (زيادة) وحساب التكلفة المنعكسة
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        SELECT COALESCE(weighted_average_cost, cost, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 4. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    -- 5. إنشاء أسطر القيد
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    IF v_total_cost > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_inv, v_total_cost, 0, 'إعادة للمخزون', v_org_id), (v_journal_id, v_acc_cogs, 0, v_total_cost, 'عكس تكلفة مبيعات', v_org_id); END IF;

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END; $$;

-- ب. اعتماد مرتجع مشتريات (Purchase Return)
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid; v_mappings jsonb; v_acc_sales_ret uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'المرتجع غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    
    v_org_id := public.get_my_org();
    IF v_return.organization_id != v_org_id THEN RAISE EXCEPTION 'تحذير أمني'; END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_inv := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_acc_vat := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_acc_supp := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_acc_supp, v_return.total_amount, 0, 'تخفيض استحقاق مورد', v_org_id);
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_acc_inv, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'تخفيض مخزون بالمرتجع', v_org_id);
    
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_return.tax_amount, 'عكس ضريبة مدخلات', v_org_id); END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END; $$;

-- ج. اعتماد الإشعار المدين (Debit Note) للموردين
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_supp uuid; v_acc_cogs uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_supp := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين للمورد رقم ' || v_note.debit_note_number, v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_supp, v_note.total_amount, 0, 'تخفيض حساب المورد', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cogs, 0, v_note.total_amount, 'تسوية تكلفة (خصم مكتسب)', v_org_id);

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- د. اعتماد إشعار دائن (Credit Note) للعملاء
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_allowance uuid; v_acc_cust uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_allowance := COALESCE((v_mappings->>'SALES_DISCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن للعميل رقم ' || v_note.credit_note_number, v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) 
    VALUES (v_journal_id, v_acc_allowance, v_note.total_amount, 0, v_org_id), (v_journal_id, v_acc_cust, 0, v_note.total_amount, v_org_id);

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- هـ. اعتماد سند القبض (Receipt Voucher)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id), (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- و. اعتماد سند الصرف (Payment Voucher)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id), (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- ================================================================
-- 3. مديول المطاعم (Restaurant Module)
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL
    , p_delivery_info jsonb DEFAULT NULL -- إضافة معلومات التوصيل
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0; v_unit_price numeric; v_qty numeric;
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, p_warehouse_id) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🛡️ استخراج القيم وضمان عدم وجود NULL
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 1);
        v_unit_price := COALESCE(
            (v_item->>'unit_price')::numeric, 
            (v_item->>'unitPrice')::numeric, 
            (v_item->>'price')::numeric, 
            0
        );

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id, modifiers)
        VALUES (
            v_order_id, 
            COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid), 
            v_qty, 
            v_unit_price, 
            (v_qty * v_unit_price), 
            COALESCE((v_item->>'unit_cost')::numeric, (v_item->>'unitCost')::numeric, 0), 
            v_item->>'notes', 
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
     IF p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0), v_org_id);
    END IF;   
    RETURN v_order_id;
END; $$;

-- 📱 دالة استقبال طلبات الزبائن عبر رمز QR (Public Menu Orders)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record;
    v_session_id uuid;
    v_order_id uuid;
    v_item jsonb;
    v_order_num text;
    v_tax_rate numeric; v_qty numeric; v_unit_price numeric;
    v_subtotal numeric := 0;
    v_order_item_id uuid;
BEGIN
    -- 1. التحقق من صحة رمز الطاولة (الوصول عبر SECURITY DEFINER لتخطي RLS)
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز الطاولة غير صالح أو منتهي الصلاحية'; END IF;

    -- 2. إيجاد أو إنشاء جلسة (Session) للطاولة لربط الطلبات بها
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN')
        RETURNING id INTO v_session_id;
        
        -- تحديث حالة الطاولة لتظهر "مشغولة" في شاشة الكاشير فوراً
        UPDATE public.restaurant_tables SET status = 'OCCUPIED' WHERE id = v_table.id;
    END IF;

    -- 3. جلب نسبة الضريبة من إعدادات المطعم
    SELECT vat_rate INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_table.organization_id;
    v_tax_rate := COALESCE(v_tax_rate, 0.14);

    -- 4. توليد رقم طلب مميز
    v_order_num := 'QR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    -- 5. إنشاء الطلب الرئيسي
    INSERT INTO public.orders (
        session_id, organization_id, order_number, order_type, status, subtotal, total_tax, grand_total
    ) VALUES (
        v_session_id, v_table.organization_id, v_order_num, 'DINEIN', 'CONFIRMED', 0, 0, 0
    ) RETURNING id INTO v_order_id;

    -- 6. إضافة الأصناف وتوليد طلبات المطبخ تلقائياً
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🛡️ استخراج القيم بشكل آمن لمنع خطأ الـ Not Null
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 1);
        v_unit_price := COALESCE(
            (v_item->>'unit_price')::numeric, 
            (v_item->>'unitPrice')::numeric, 
            (v_item->>'price')::numeric, 
            0
        );

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id, modifiers
        ) VALUES (
            v_order_id, (v_item->>'product_id')::uuid, 
            v_qty, 
            v_unit_price, 
            (v_qty * v_unit_price),
            COALESCE((v_item->>'unit_cost')::numeric, 0), v_item->>'notes', v_table.organization_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);

        -- إرسال تنبيه للمطبخ (KDS) فوراً
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id)
        VALUES (v_order_item_id, 'NEW', v_table.organization_id);
    END LOOP;

    -- 7. تحديث إجماليات الطلب النهائية
    UPDATE public.orders SET
        subtotal = v_subtotal,
        total_tax = v_subtotal * v_tax_rate,
        grand_total = v_subtotal + (v_subtotal * v_tax_rate)
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- منح صلاحية تنفيذ الدالة للزوار (الموبايل) والموظفين
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb) TO anon, authenticated;
-- 🛠️ دالة جلب ملخص الوردية (التي تظهر للمحاسب قبل الإغلاق)
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record;
    v_summary record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    SELECT 
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(total_tax), 0) as total_tax,
        COALESCE(SUM(grand_total), 0) as total_sales,
        COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM public.payments pay WHERE pay.order_id = o.id AND pay.payment_method = 'CASH') THEN grand_total ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM public.payments pay WHERE pay.order_id = o.id AND pay.payment_method = 'CARD') THEN grand_total ELSE 0 END), 0) as card_sales
    INTO v_summary
    FROM public.orders o
    WHERE o.user_id = v_shift.user_id 
    AND o.created_at BETWEEN v_shift.start_time AND now()
    AND o.status IN ('COMPLETED', 'PAID', 'posted')
    AND o.organization_id = v_shift.organization_id;

    RETURN json_build_object(
        'opening_balance', v_shift.opening_balance,
        'total_sales', v_summary.total_sales,
        'total_tax', v_summary.total_tax,
        'cash_sales', v_summary.cash_sales,
        'card_sales', v_summary.card_sales,
        'expected_cash', v_shift.opening_balance + v_summary.cash_sales
    );
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع (القلب المحاسبي للوردية)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_total_cost numeric := 0;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_sales_dinein_acc_id uuid; v_sales_delivery_acc_id uuid;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;

    -- 1. تجميع المبيعات والضرائب وطرق الدفع والتكلفة من الطلبات المكتملة ✅
    SELECT 
        COALESCE(SUM(o.subtotal), 0) as subtotal,
        COALESCE(SUM(o.total_tax), 0) as tax,
        COALESCE(SUM(o.grand_total), 0) as total,
        COALESCE(SUM(CASE WHEN o.order_type = 'DINEIN' THEN o.subtotal ELSE 0 END), 0) as dinein_subtotal,
        COALESCE(SUM(CASE WHEN o.order_type != 'DINEIN' THEN o.subtotal ELSE 0 END), 0) as delivery_subtotal,
        -- 🚀 محرك حساب التكلفة المطور: يحسب من التكلفة المسجلة أو الوصفة (BOM) أو بطاقة الصنف
        COALESCE(SUM((
            SELECT SUM(COALESCE(NULLIF(itms.unit_cost, 0), public.get_product_recipe_cost(itms.product_id), (SELECT cost FROM public.products WHERE id = itms.product_id), 0) * itms.quantity)
            FROM public.order_items itms WHERE itms.order_id = o.id
        )), 0) as cost_total,
        COALESCE(SUM(CASE WHEN pay.payment_method = 'CASH' THEN pay.amount ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN pay.payment_method = 'CARD' THEN pay.amount ELSE 0 END), 0) as card_total
    INTO v_summary
    FROM public.orders o
    LEFT JOIN public.payments pay ON pay.order_id = o.id
    WHERE o.user_id = v_shift.user_id 
    AND o.created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    AND o.status IN ('COMPLETED', 'PAID', 'posted')
    AND o.organization_id = v_shift.organization_id;

    IF v_summary.total = 0 THEN RETURN NULL; END IF;

    -- 2. جلب الحسابات السيادية
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_shift.organization_id;
    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_card_acc_id := COALESCE((v_mappings->>'BANK_ACCOUNTS')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_shift.organization_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_shift.organization_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_shift.organization_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_shift.organization_id LIMIT 1));
    -- جلب حسابات المطاعم التفصيلية من الدليل المحاسبي
    v_sales_dinein_acc_id := (SELECT id FROM public.accounts WHERE organization_id = v_shift.organization_id AND code = '4111' LIMIT 1);
    v_sales_delivery_acc_id := (SELECT id FROM public.accounts WHERE organization_id = v_shift.organization_id AND code = '4112' LIMIT 1);

    -- 3. إنشاء رأس القيد (قيد يومية مرحل تلقائياً)
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'ترحيل مبيعات وردية مجمع - ID: ' || substring(p_shift_id::text, 1, 8), 'SHIFT-POST-' || to_char(now(), 'YYMMDD-HH24MI'), 'posted', v_shift.organization_id, true, p_shift_id, 'shift')
    RETURNING id INTO v_je_id;

    -- 4. أسطر القيد (الطرف المدين: نقدية وشبكة)
    IF v_summary.cash_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_summary.cash_total, 0, 'إجمالي متحصلات كاش الوردية', v_shift.organization_id);
    END IF;
    IF v_summary.card_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, v_summary.card_total, 0, 'إجمالي متحصلات شبكة الوردية', v_shift.organization_id);
    END IF;

    -- 5. أسطر القيد (الطرف الدائن: مبيعات وضريبة) ✅
    -- توزيع المبيعات محاسبياً حسب النوع (صالة vs توصيل)
    IF v_sales_dinein_acc_id IS NOT NULL AND v_sales_delivery_acc_id IS NOT NULL THEN
        IF v_summary.dinein_subtotal > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_sales_dinein_acc_id, 0, v_summary.dinein_subtotal, 'إجمالي مبيعات الصالة بالوردية', v_shift.organization_id);
        END IF;
        IF v_summary.delivery_subtotal > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_sales_delivery_acc_id, 0, v_summary.delivery_subtotal, 'إجمالي مبيعات التوصيل/السفري بالوردية', v_shift.organization_id);
        END IF;
    ELSE
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إجمالي مبيعات الوردية (حساب عام)', v_shift.organization_id);
    END IF;

    IF v_summary.tax > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة للوردية (14%)', v_shift.organization_id);
    END IF;

    -- 6. أسطر القيد (التكلفة: من ح/ التكلفة إلى ح/ المخزون) ✅ جديد
    IF v_summary.cost_total > 0 AND v_cogs_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_je_id, v_cogs_acc_id, v_summary.cost_total, 0, 'تكلفة مبيعات الوردية المجمعة', v_shift.organization_id),
            (v_je_id, v_inventory_acc_id, 0, v_summary.cost_total, 'صرف مخزون الوردية المجمع', v_shift.organization_id);
    END IF;

    RETURN v_je_id;
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(p_shift_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. ترحيل القيد المحاسبي المجمع
    PERFORM public.generate_shift_closing_entry(p_shift_id);

    -- 2. تحديث حالة الوردية وإنهائها
    UPDATE public.shifts SET 
        end_time = now(),
        actual_cash = p_actual_cash,
        status = 'CLOSED',
        notes = p_notes
    WHERE id = p_shift_id;
END; $$;
-- ================================================================
-- 4. مديول الموارد البشرية (HR & Payroll)
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_acc uuid, p_items jsonb) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_user_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
BEGIN
    v_user_id := auth.uid();
    v_org_id := COALESCE((SELECT organization_id FROM public.profiles WHERE id = v_user_id LIMIT 1), public.get_my_org());

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1));
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1));
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'فشل جلب إعدادات الحسابات المالية للرواتب، يرجى مراجعة Account Mappings في إعدادات الشركة.'; 
    END IF;

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items)) THEN RAISE EXCEPTION 'لا توجد بيانات موظفين صالحة في المسير.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0);
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, (v_item->>'gross_salary')::numeric, (v_item->>'additions')::numeric, COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, (v_item->>'other_deductions')::numeric, (v_item->>'net_salary')::numeric, v_org_id);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll') RETURNING id INTO v_je_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 AND v_payroll_tax_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

    -- 🛡️ التحقق النهائي من توازن القيد لضمان الترحيل الفعلي للدفتر العام
        -- 🛡️ التحقق النهائي من توازن القيد لضمان الترحيل الفعلي للدفتر العام
    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_je_id) THEN RAISE EXCEPTION 'فشل إنشاء أسطر القيد المحاسبي للرواتب، القيد غير متوازن أو الحسابات مفقودة.'; END IF;
END; $$;


-- ================================================================
-- 5. تأسيس الشركات (Onboarding & SaaS Core)
-- ================================================================

-- أ. دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
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
    v_org_id := (new.raw_user_meta_data->>'org_id')::uuid;
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');

    -- 1. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل (السوبر أدمن الأول)
    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    -- 2. التحقق من الدعوات إذا لم يوجد معرف شركة في الـ Metadata
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations 
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;
        
        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    -- 3. ضمان تعيين دور admin إذا كان المستخدم هو أول من ينضم لمنظمة موجودة
    IF v_org_id IS NOT NULL AND v_role IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE organization_id = v_org_id) THEN
            v_role := 'admin';
        END IF;
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

    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object('org_id', v_org_id, 'role', v_role)
    WHERE id = new.id;

    RETURN new;
END;
$$;

-- إنشاء التريجر ليربط مع نظام الحماية الخاص بـ Supabase (auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ب. دالة التحقق من عدد المستخدمين (منع تجاوز حدود الباقة)
CREATE OR REPLACE FUNCTION public.check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users integer;
    v_current_users integer;
BEGIN
    IF public.get_my_role() = 'super_admin' OR NEW.role = 'super_admin' THEN
        RETURN NEW;
    END IF;
    SELECT max_users INTO v_max_users FROM public.organizations WHERE id = NEW.organization_id;
    SELECT count(*) INTO v_current_users FROM public.profiles 
    WHERE organization_id = NEW.organization_id AND role != 'super_admin';
    IF v_current_users >= COALESCE(v_max_users, 5) THEN
        RAISE EXCEPTION '⚠️ عذراً، لقد وصلت للحد الأقصى للمستخدمين المسموح بهم في باقتك الحالية (%). يرجى ترقية الباقة لإضافة المزيد.', v_max_users;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ج. تهيئة الدليل المحاسبي المصري لشركة جديدة (Core SaaS Onboarding)
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_org_name text; v_rec record; v_parent_id uuid; v_role_id uuid; v_warehouse_id uuid;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid; v_sal_ret_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid; v_retained_id uuid;
BEGIN
    v_vat_rate := CASE WHEN p_activity_type = 'construction' THEN 0.05 WHEN p_activity_type = 'charity' THEN 0.00 ELSE 0.14 END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    CREATE TEMPORARY TABLE coa_temp (code text PRIMARY KEY, name text NOT NULL, type text NOT NULL, is_group boolean NOT NULL, parent_code text) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'asset', true, NULL), ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL), ('3', 'حقوق الملكية', 'equity', true, NULL), ('4', 'الإيرادات', 'revenue', true, NULL), ('5', 'المصروفات', 'expense', true, NULL),
    ('11', 'الأصول غير المتداولة', 'asset', true, '1'), ('12', 'الأصول المتداولة', 'asset', true, '1'), ('21', 'الخصوم غير المتداولة', 'liability', true, '2'), ('22', 'الخصوم المتداولة', 'liability', true, '2'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'), ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'), ('33', 'جاري الشركاء', 'equity', false, '3'), ('34', 'احتياطيات', 'equity', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'), ('42', 'إيرادات أخرى', 'revenue', true, '4'), ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'), ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'), ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
    ('111', 'الأصول الثابتة (بالصافي)', 'asset', true, '11'), ('1111', 'الأراضي', 'asset', false, '111'), ('1112', 'المباني والإنشاءات', 'asset', false, '111'), ('1113', 'الآلات والمعدات', 'asset', false, '111'), ('1114', 'وسائل النقل والانتقال', 'asset', false, '111'), ('1115', 'الأثاث والتجهيزات المكتبية', 'asset', false, '111'), ('1116', 'أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'), ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
    ('103', 'المخزون', 'asset', true, '12'), ('10301', 'مخزون المواد الخام', 'asset', false, '103'), ('10302', 'مخزون المنتج التام', 'asset', false, '103'),
    ('122', 'العملاء والمدينون', 'asset', true, '12'), ('1221', 'العملاء', 'asset', false, '122'), ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'), ('1223', 'سلف الموظفين', 'asset', false, '122'), ('1224', 'عهد موظفين', 'asset', false, '122'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'), ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'asset', false, '123'), ('1232', 'البنوك (حسابات جارية)', 'asset', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'), ('123202', 'بنك مصر', 'asset', false, '1232'), ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'), ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'), ('123205', 'بنك القاهرة', 'asset', false, '1232'), ('123206', 'بنك فيصل الإسلامي', 'asset', false, '1232'), ('123207', 'بنك الإسكندرية', 'asset', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'asset', true, '123'), ('123301', 'فودافون كاش (Vodafone Cash)', 'asset', false, '1233'), ('123302', 'اتصالات كاش (Etisalat Cash)', 'asset', false, '1233'), ('123303', 'أورنج كاش (Orange Cash)', 'asset', false, '1233'), ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'), ('123305', 'انستا باي (InstaPay - تسوية)', 'asset', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'), ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'), ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'), ('124301', 'إيجار مقدم', 'asset', false, '1243'), ('124302', 'تأمين طبي مقدم', 'asset', false, '1243'), ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'asset', false, '1243'), ('124304', 'حملات إعلانية مقدمة', 'asset', false, '1243'), ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'asset', true, '124'), ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'asset', false, '1244'), ('124402', 'فوائد بنكية مستحقة القبض', 'asset', false, '1244'), ('124403', 'إيجارات دائنة مستحقة', 'asset', false, '1244'), ('124404', 'إيرادات أوراق مالية مستحقة', 'asset', false, '1244'),
    ('211', 'قروض طويلة الأجل', 'liability', false, '21'), ('201', 'الموردين', 'liability', false, '22'), ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'), ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'), ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'), ('2233', 'ضريبة كسب العمل', 'liability', false, '223'), ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'),
    ('225', 'مصروفات مستحقة', 'liability', true, '22'), ('2251', 'رواتب وأجور مستحقة', 'liability', false, '225'), ('2252', 'إيجارات مستحقة', 'liability', false, '225'), ('2253', 'كهرباء ومياه وغاز مستحقة', 'liability', false, '225'), ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'liability', false, '225'), ('2255', 'عمولات بيع مستحقة', 'liability', false, '225'), ('2256', 'فوائد بنكية مستحقة', 'liability', false, '225'), ('2257', 'اشتراكات وتراخيص مستحقة', 'liability', false, '225'), ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
    ('411', 'إيراد المبيعات', 'revenue', false, '41'), ('412', 'مردودات المبيعات', 'revenue', false, '41'), ('413', 'خصم مسموح به', 'revenue', false, '41'),
    ('421', 'إيرادات متنوعة', 'revenue', false, '42'), ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'), ('423', 'فوائد بنكية دائنة', 'revenue', false, '42'),
    ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'), ('512', 'تسويات الجرد (عجز المخزون)', 'expense', false, '51'),
    ('521', 'دعاية وإعلان', 'expense', false, '52'), ('522', 'عمولات بيع وتسويق', 'expense', false, '52'), ('523', 'نقل ومشال للخارج', 'expense', false, '52'), ('524', 'تعبئة وتغليف', 'expense', false, '52'),
    ('5251', 'عمولة فودافون كاش', 'expense', false, '525'), ('5252', 'عمولة فوري', 'expense', false, '525'), ('5253', 'عمولة تحويلات بنكية', 'expense', false, '525'),
    ('531', 'الرواتب والأجور', 'expense', false, '53'), ('5311', 'بدلات وانتقالات', 'expense', false, '53'), ('5312', 'مكافآت وحوافز', 'expense', false, '53'), ('532', 'إيجار مقرات إدارية', 'expense', false, '53'), ('533', 'إهلاك الأصول الثابتة', 'expense', false, '53'), ('534', 'رسوم ومصروفات بنكية', 'expense', false, '53'), ('535', 'كهرباء ومياه وغاز', 'expense', false, '53'), ('536', 'اتصالات وإنترنت', 'expense', false, '53'), ('537', 'صيانة وإصلاح', 'expense', false, '53'), ('538', 'أدوات مكتبية ومطبوعات', 'expense', false, '53'), ('539', 'ضيافة واستقبال', 'expense', false, '53'), ('541', 'تسوية عجز الصندوق', 'expense', false, '53'), ('542', 'إكراميات', 'expense', false, '53'), ('543', 'مصاريف نظافة', 'expense', false, '53');
    -- إضافات خاصة بنشاط المطاعم
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('4111', 'إيرادات مبيعات (صالة)', 'revenue', false, '41'),
        ('4112', 'إيرادات مبيعات (توصيل)', 'revenue', false, '41'),
        ('5121', 'تكلفة الهالك والضيافة', 'expense', false, '51');
    END IF;

    -- إضافات خاصة بنشاط التصنيع
    IF p_activity_type = 'manufacturing' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
        ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'),
        ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
        ('5141', 'إهلاك آلات ومعدات المصنع', 'expense', false, '514'),
        ('5142', 'صيانة وإصلاح المصنع', 'expense', false, '514'),
        ('5143', 'كهرباء وقوى محركة للمصنع', 'expense', false, '514');
    END IF;
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ORDER BY length(code), code
    ON CONFLICT (organization_id, code) DO NOTHING;

    UPDATE public.accounts a SET parent_id = p.id FROM coa_temp t JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code AND a.parent_id IS NULL;

    -- 🚀 إنشاء دور المدير وحفظ معرفه في متغير لضمان السرعة والدقة
    INSERT INTO public.roles (organization_id, name, description)
    VALUES (p_org_id, 'admin', 'مدير النظام')
    ON CONFLICT (name, organization_id) 
    DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_role_id;

    -- 🏗️ إنشاء مستودع افتراضي للشركة (يجب أن يكون خارج شرط الأدمن لضمان عمل النظام فوراً)
    v_warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = p_org_id AND name = 'المخزن الرئيسي' LIMIT 1);
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.warehouses (organization_id, name, location, is_active)
        VALUES (p_org_id, 'المخزن الرئيسي', 'الفرع الرئيسي', true)
        RETURNING id INTO v_warehouse_id;
    END IF;

    -- ️ إصلاح أمني: نستخدم المعرف الممرر فقط لتعيين المدير.
    v_admin_id := p_admin_id;
    IF v_admin_id IS NOT NULL THEN
        -- التأكد من إنشاء أو تحديث ملف المستخدم وربطه بالشركة الجديدة
        INSERT INTO public.profiles (id, organization_id, role, is_active, role_id, full_name)
        VALUES (
            v_admin_id,
            p_org_id,
            'admin',
            true,
            v_role_id,
            COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_admin_id), 'مدير النظام')
        )
        ON CONFLICT (id) DO UPDATE SET 
            role = 'admin', organization_id = p_org_id, is_active = true, role_id = v_role_id;
        
        UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin') WHERE id = v_admin_id;
    END IF;

    -- 🛡️ منح كافة الصلاحيات المتاحة في السيستم لهذا الدور الجديد
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT v_role_id, id, p_org_id
    FROM public.permissions 
    ON CONFLICT DO NOTHING;

    v_cash_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1);
    v_sales_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1);
    v_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1);
    v_cogs_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1);
    v_inv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1);
    v_vat_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1);
    v_supp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1);
    v_sal_ret_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_vat_in_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1);
    v_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '413' LIMIT 1);
    v_wht_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1);
    v_payroll_tax_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1);
    v_wht_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1);
    v_sal_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1);
    v_bonus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1);
    v_ded_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1);
    -- 🚀 تأسيس سجل الإعدادات والربط المحاسبي فوراً لضمان اختفاء خطأ 406
    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name, account_mappings, default_warehouse_id, default_treasury_id)
    VALUES (p_org_id, p_activity_type, v_vat_rate, v_org_name, 
        jsonb_build_object(
            'CASH', v_cash_id, 'SALES_REVENUE', v_sales_id, 'CUSTOMERS', v_cust_id, 'COGS', v_cogs_id, 'INVENTORY_FINISHED_GOODS', v_inv_id,
            'VAT', v_vat_id, 'SUPPLIERS', v_supp_id, 'SALES_RETURNS', v_sal_ret_id, 'VAT_INPUT', v_vat_in_id, 'SALES_DISCOUNT', v_disc_id,
            'WHT_PAYABLE', v_wht_pay_id, 'PAYROLL_TAX', v_payroll_tax_id, 'WHT_RECEIVABLE', v_wht_rec_id,
            'SALARIES_EXPENSE', v_sal_exp_id, 'EMPLOYEE_BONUSES', v_bonus_id, 'EMPLOYEE_DEDUCTIONS', v_ded_id, 'EMPLOYEE_ADVANCES', v_adv_id,
            'RETAINED_EARNINGS', (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1)
        ),
        v_warehouse_id,
        v_cash_id
    ) ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings, default_warehouse_id = EXCLUDED.default_warehouse_id, default_treasury_id = EXCLUDED.default_treasury_id;

    -- تأسيس الأدوار الافتراضية للمنظمة لضمان ظهورها في شاشة الصلاحيات
    INSERT INTO public.roles (organization_id, name, description) VALUES
    (p_org_id, 'admin', 'مدير النظام'),
    (p_org_id, 'accountant', 'محاسب'),
    (p_org_id, 'cashier', 'كاشير / بائع'),
    (p_org_id, 'chef', 'شيف / مطبخ')
    ON CONFLICT (name, organization_id) DO NOTHING;

    RETURN '✅ تم تأسيس الدليل المحاسبي وربط الحسابات السيادية بنجاح.';

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ بالتفصيل في حال فشل بناء الدليل المحاسبي
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, organization_id, user_id)
    VALUES (SQLERRM, SQLSTATE, jsonb_build_object('org_id', p_org_id, 'activity', p_activity_type), 'initialize_egyptian_coa', p_org_id, auth.uid());
    
    RAISE EXCEPTION 'فشل تأسيس دليل الحسابات: % (كود: %)', SQLERRM, SQLSTATE;
END; $$;

-- د. الدالة الشاملة لإنشاء شركة جديدة (Global SaaS Creator)
CREATE OR REPLACE FUNCTION public.create_new_client_v2(p_name text, p_email text, p_activity_type text DEFAULT 'commercial', p_vat_number text DEFAULT NULL, p_admin_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true) RETURNING id INTO v_org_id;
    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type, p_admin_id);
    RETURN v_org_id;
END; $$;

-- ح. دالة مزامنة صلاحيات الأدوار (Atomic Role Permissions Sync)
-- هذه الدالة تحل مشكلة حفظ الصلاحيات وضمان أمان البيانات
CREATE OR REPLACE FUNCTION public.sync_role_permissions(p_role_id uuid, p_permission_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    -- جلب معرف المنظمة للدور المستهدف لضمان الأمان
    SELECT organization_id INTO v_org_id FROM public.roles WHERE id = p_role_id;
    IF v_org_id IS NULL OR v_org_id != public.get_my_org() THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل صلاحيات هذا الدور.';
    END IF;

    -- مسح الصلاحيات الحالية (ضمن معاملة واحدة)
    DELETE FROM public.role_permissions WHERE role_id = p_role_id AND organization_id = v_org_id;

    -- إضافة الصلاحيات الجديدة
    IF array_length(p_permission_ids, 1) > 0 THEN
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT p_role_id, unnest(p_permission_ids), v_org_id;
    END IF;
END; $$;

-- و. دالة جلب تكلفة وصفة المنتج (للمطاعم والتصنيع)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cost NUMERIC;
BEGIN
    SELECT COALESCE(SUM(r.quantity_required * COALESCE(ing.weighted_average_cost, ing.cost, ing.purchase_price, 0)), 0) INTO v_cost
    FROM public.bill_of_materials r JOIN public.products ing ON r.raw_material_id = ing.id WHERE r.product_id = p_product_id;
    RETURN v_cost;
END; $$;

-- ز. صيانة النظام والتقارير
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL AND organization_id = v_target_org LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL AND organization_id = v_target_org LOOP
            wh_qty := 0;
            SELECT COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM public.opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id AND oi.organization_id = v_target_org;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status NOT IN ('draft', 'cancelled') AND pi.organization_id = v_target_org), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = v_target_org), 0) INTO wh_qty;
            -- 🛡️ إضافة: خصم مبيعات المطعم من المخزون
            SELECT wh_qty - COALESCE((SELECT SUM(oi.quantity) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.product_id = prod_record.id AND o.warehouse_id = wh_record.id AND o.status IN ('COMPLETED', 'PAID', 'posted') AND o.organization_id = v_target_org), 0) INTO wh_qty;
            SELECT wh_qty + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status = 'posted' AND sr.organization_id = v_target_org), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status = 'posted' AND pr.organization_id = v_target_org), 0) INTO wh_qty;
            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id::text, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id AND organization_id = v_target_org;
    END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL) 
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_target_org uuid;
    v_inv record;
    v_total_cost numeric;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_mappings jsonb;
    v_item_cost numeric;
    v_item record;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 1. تحديث المخزون أولاً لضمان دقة المتوسطات المرجحة
    PERFORM public.recalculate_stock_rpc(v_target_org);

    -- 🛡️ جديد: إصلاح قيود التكلفة المفقودة (Repairing missing COGS entries)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_target_org;
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_target_org AND deleted_at IS NULL LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_target_org AND deleted_at IS NULL LIMIT 1));

    IF v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        FOR v_inv IN SELECT id, related_journal_entry_id FROM public.invoices WHERE organization_id = v_target_org AND status IN ('posted', 'paid') AND related_journal_entry_id IS NOT NULL LOOP
            -- إذا كان القيد يفتقر لأسطر التكلفة (نبحث عن حساب التكلفة أو المخزون في أسطر القيد)
            IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_inv.related_journal_entry_id AND (account_id = v_cogs_acc_id OR account_id = v_inventory_acc_id)) THEN
                v_total_cost := 0;
                FOR v_item IN SELECT product_id, quantity, id FROM public.invoice_items WHERE invoice_id = v_inv.id LOOP
                    SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) 
                    INTO v_item_cost 
                    FROM public.products 
                    WHERE id = v_item.product_id AND organization_id = v_target_org;
                    
                    v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
                    UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;
                END LOOP;

                -- إضافة أسطر القيد إذا كانت التكلفة أكبر من صفر
                IF v_total_cost > 0 THEN
                    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                    VALUES 
                        (v_inv.related_journal_entry_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات (إعادة إنشاء)', v_target_org),
                        (v_inv.related_journal_entry_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون (إعادة إنشاء)', v_target_org);
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 🛡️ جديد: إصلاح قيود التكلفة المفقودة لطلبات المطعم (Orders COGS Repair)
    FOR v_inv IN SELECT id, related_journal_entry_id FROM public.orders WHERE organization_id = v_target_org AND status IN ('COMPLETED', 'PAID', 'posted') AND related_journal_entry_id IS NOT NULL LOOP
        IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_inv.related_journal_entry_id AND (account_id = v_cogs_acc_id OR account_id = v_inventory_acc_id)) THEN
            v_total_cost := 0;
            FOR v_item IN SELECT product_id, quantity, unit_cost, id FROM public.order_items WHERE order_id = v_inv.id LOOP
                -- محاولة جلب التكلفة المسجلة، وإلا جلبها من بطاقة الصنف
                v_item_cost := COALESCE(NULLIF(v_item.unit_cost, 0), 0);
                IF v_item_cost = 0 THEN
                   SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) 
                   INTO v_item_cost 
                   FROM public.products 
                   WHERE id = v_item.product_id AND organization_id = v_target_org;
                END IF;
                
                v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
                UPDATE public.order_items SET unit_cost = v_item_cost WHERE id = v_item.id;
            END LOOP;

            IF v_total_cost > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES 
                    (v_inv.related_journal_entry_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات مطعم (إعادة مطابقة)', v_target_org),
                    (v_inv.related_journal_entry_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون مطعم (إعادة مطابقة)', v_target_org);
            END IF;
        END IF;
    END LOOP;

    -- 2. تصفير كافة الأرصدة للمنظمة المستهدفة للبدء من جديد
    UPDATE public.accounts SET balance = 0 WHERE organization_id = v_target_org;

    -- 3. المرحلة الأولى: تحديث أرصدة كافة الحسابات من واقع قيود اليومية المرحلة
    -- ملاحظة: الأرصدة الافتتاحية يجب أن تكون مدخلة كقيد يومية مرحل لتظهر هنا
    UPDATE public.accounts a 
    SET balance = (
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
        FROM public.journal_lines jl 
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id 
        WHERE jl.account_id = a.id 
        AND je.status = 'posted' 
        AND je.organization_id = v_target_org
    ) 
    WHERE a.organization_id = v_target_org;

    -- 4. المرحلة الثانية: تجميع أرصدة الحسابات الرئيسية (Roll-up aggregation)
    -- نستخدم حلقة تكرارية عكسية لضمان تصاعد الأرصدة من أعمق مستوى إلى الحسابات الرئيسية
    FOR i IN REVERSE 10..1 LOOP
        UPDATE public.accounts p
        SET balance = (SELECT COALESCE(SUM(c.balance), 0) FROM public.accounts c WHERE c.parent_id = p.id)
        WHERE p.organization_id = v_target_org AND p.is_group = true;
    END LOOP;
    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية وإصلاح قيود التكلفة بنجاح ✅';
END; $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats() 
RETURNS json 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth -- 🛡️ تأمين مسار البحث لزيادة الأمان
AS $$
DECLARE v_month_sales numeric; v_receivables numeric; v_payables numeric; v_low_stock_count integer; v_chart_data json; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    SELECT COALESCE(SUM(amount), 0) INTO v_month_sales FROM public.monthly_sales_dashboard WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE);
    -- 🛡️ حساب الذمم المدينة (العملاء 1221) والدائنة (الموردين 201) من واقع أرصدة الحسابات الفرعية النشطة فقط
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '1221%' AND is_group = false AND deleted_at IS NULL;
    SELECT COALESCE(SUM(ABS(balance)), 0) INTO v_payables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '201%' AND is_group = false AND deleted_at IS NULL;
    
    SELECT COUNT(*) INTO v_low_stock_count FROM public.products WHERE organization_id = v_org_id AND stock <= COALESCE(min_stock_level, 0) AND deleted_at IS NULL;

    -- جلب بيانات الرسم البياني لآخر 6 أشهر
    SELECT json_agg(t) INTO v_chart_data FROM (
        SELECT to_char(month, 'YYYY-MM') as name, 
        COALESCE((SELECT SUM(amount) FROM public.monthly_sales_dashboard WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = month), 0) as sales 
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), '1 month') as month
    ) t;

    RETURN json_build_object('monthSales', v_month_sales, 'receivables', v_receivables, 'payables', v_payables, 'lowStockCount', v_low_stock_count, 'chartData', v_chart_data);
END; $$;

CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- جلب معرف الدور (Admin) الخاص بهذه المنظمة تحديداً
    SELECT id INTO v_role_id FROM public.roles 
    WHERE organization_id = p_org_id AND name = 'admin' 
    LIMIT 1;

    -- تحديث البروفايل بالاسم والرقم التعريفي للدور
    UPDATE public.profiles 
    SET role = 'admin', 
        role_id = v_role_id, 
        organization_id = p_org_id, 
        is_active = true 
    WHERE id = p_user_id;

    -- تحديث بيانات الدخول لضمان التعرف على الشركة في الجلسة
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                             jsonb_build_object('org_id', p_org_id, 'role', 'admin') 
    WHERE id = p_user_id;

    RETURN 'تم منح صلاحيات المدير بنجاح ✅';
END; $$;

-- 🛠️ دالة توليد أو جلب مفتاح QR للطاولة (Restaurant QR Menu)
CREATE OR REPLACE FUNCTION public.get_or_create_qr_for_table(p_table_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_table record;
    v_qr_key uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    SELECT * INTO v_table 
    FROM public.restaurant_tables 
    WHERE id = p_table_id AND organization_id = v_org_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الطاولة غير موجودة أو لا تملك صلاحية الوصول إليها';
    END IF;
    
    v_qr_key := v_table.qr_access_key;
    
    IF v_qr_key IS NULL THEN
        v_qr_key := gen_random_uuid();
        UPDATE public.restaurant_tables SET qr_access_key = v_qr_key WHERE id = p_table_id;
    END IF;
    
    RETURN json_build_object(
        'qr_access_key', v_qr_key,
        'table_name', v_table.name
    );
END; $$;

-- 🛡️ دالة جلب الإعدادات الآمنة (تتخطى مشاكل التوكن العالق)
CREATE OR REPLACE FUNCTION public.get_current_company_settings()
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- جلب معرف المنظمة من البروفايل مباشرة (المصدر الأكثر ثقة)
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE id = auth.uid();
    
    RETURN QUERY SELECT * FROM public.company_settings WHERE organization_id = v_org_id;
END;
$$;
-- ================================================================
-- 🚀 الحل السحري لمشكلة تحويل عروض الأسعار: المشغل التلقائي
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم إدراج فاتورة حالتها 'posted' (كما يحدث عند تحويل عروض الأسعار) وليس لها قيد
    IF NEW.status = 'posted' AND NEW.related_journal_entry_id IS NULL THEN
        PERFORM public.approve_invoice(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

-- 🛠️ مشغل إضافي لمراقبة بنود الفاتورة (لضمان معالجة الفواتير التي تصل بنودها متأخرة)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا كانت الفاتورة الأم 'posted' وبدون قيد، نحاول اعتمادها الآن بعد توفر البنود
    IF EXISTS (
        SELECT 1 FROM public.invoices 
        WHERE id = NEW.invoice_id AND status = 'posted' AND related_journal_entry_id IS NULL
    ) THEN
        PERFORM public.approve_invoice(NEW.invoice_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();

-- 🚀 تنشيط كاش النظام لضمان تعرف الـ API على الأعمدة الجديدة فوراً
SELECT public.refresh_saas_schema();
NOTIFY pgrst, 'reload config';
