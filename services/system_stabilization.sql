-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- قم بتشغيل هذا الملف في Supabase SQL Editor لضمان توافق قاعدة البيانات مع الكود

BEGIN;

-- 1. توحيد أسماء أعمدة المرتجعات (لتتوافق مع الكود الجديد)
DO $$
BEGIN
    -- جدول بنود مرتجع المبيعات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
        END IF;
    END IF;

    -- جدول بنود مرتجع المشتريات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
        END IF;
    END IF;
END $$;

-- 2. إضافة الأعمدة المفقودة (لضمان عدم حدوث أخطاء عند الحفظ)
-- إعدادات الكسور العشرية
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS monthly_sales_target numeric DEFAULT 0;

-- ربط الفواتير والشيكات بالقيود المحاسبية
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);

-- ربط المرتجعات بالفواتير الأصلية
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);

-- إضافة معرف المنظمة لجدول المدفوعات (ضروري لتقارير الورديات وحماية RLS)
-- إضافة الرقم الضريبي للموردين
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tax_number text;

-- إضافة عمود المسؤول عن العميل (لحل مشكلة 400 Bad Request)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id);

-- تعيين القيمة الافتراضية للمستخدم الحالي (يجعل الحقل ممتلئاً تلقائياً للعملاء الجدد)
ALTER TABLE public.customers ALTER COLUMN responsible_user_id SET DEFAULT auth.uid();

-- محاولة جعل العمود إلزامياً (NOT NULL) إذا لم تكن هناك بيانات متعارضة (أي لا يوجد عملاء حاليين بدون مسؤول)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE responsible_user_id IS NULL) THEN
        ALTER TABLE public.customers ALTER COLUMN responsible_user_id SET NOT NULL;
    END IF;
END $$;

-- تحديثات إضافية (مارس 2026)
-- تصنيفات الأصناف
CREATE TABLE IF NOT EXISTS public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar NOT NULL,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id)
);

-- تحديث جدول المنتجات
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.item_categories(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;

-- إضافة أعمدة الوصف والارصدة والحد الأدنى
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5;

-- إضافة عمود product_type ليتوافق مع الواجهة الأمامية ودوال النظام
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';

-- إضافة عمود unit ليتوافق مع واجهة إضافة الأصناف
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;

-- تحديث جدول الفواتير
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reference text;

-- تحديث جدول فواتير المشتريات
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS additional_expenses numeric DEFAULT 0;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS reference text;

-- تحديث جدول الشيكات
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_voucher_id uuid;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);

-- تحديث جدول بنود الفاتورة
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS custom_fields jsonb;

-- تحديثات مديول التصنيع لتتبع الهالك والفروقات الكمية
CREATE TABLE IF NOT EXISTS public.work_order_material_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id), -- المادة الخام
    standard_quantity numeric NOT NULL, -- الكمية المعيارية (BOM)
    actual_quantity numeric NOT NULL,   -- الكمية المستهلكة فعلياً
    wastage_quantity numeric GENERATED ALWAYS AS (actual_quantity - standard_quantity) STORED,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- جدول سجلات النسخ الاحتياطية لكل شركة
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_date timestamptz DEFAULT now(),
    backup_data jsonb NOT NULL, -- الملف الفعلي بصيغة JSON
    file_size_kb numeric,
    created_by uuid REFERENCES auth.users(id),
    notes text
);

-- 3. التأكد من وجود الحسابات المحاسبية الحرجة (لتجنب أخطاء القيود الآلية)
-- أوراق القبض (1204)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active, organization_id)
SELECT gen_random_uuid(), '1204', 'أوراق القبض (شيكات)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '102' LIMIT 1), true, COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1204' AND organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))) AND EXISTS (SELECT 1 FROM accounts WHERE code = '102');

-- أوراق الدفع (2202)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active, organization_id)
SELECT gen_random_uuid(), '2202', 'أوراق الدفع', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '2' LIMIT 1), true, COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2202' AND organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))) AND EXISTS (SELECT 1 FROM accounts WHERE code = '2');

-- 4. إصلاح صلاحيات الإشعارات (لحل مشكلة 403 Forbidden)
-- السماح للمستخدمين بإنشاء إشعارات (ضروري للعمليات التلقائية التي تعمل من طرف العميل)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'notifications' AND policyname = 'Users can create notifications'
    ) THEN
        CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
END $$;

-- 5. إصلاح تعارض أسماء الأعمدة في جدول الإشعارات
-- الخطأ: null value in column "notification_type" ...
-- السبب: الجدول يحتوي على 'notification_type' بينما التطبيق يرسل 'type'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
        -- إذا كان العمود type موجوداً بالفعل، نقوم فقط بإلغاء قيد NOT NULL عن notification_type لتجنب الخطأ
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
            ALTER TABLE public.notifications ALTER COLUMN notification_type DROP NOT NULL;
        ELSE
            -- إذا لم يكن type موجوداً، نقوم بإعادة تسمية notification_type إلى type
            ALTER TABLE public.notifications RENAME COLUMN notification_type TO "type";
        END IF;
    END IF;
END $$;

-- 6. تحديث العملة الافتراضية إلى الجنيه المصري (EGP)
-- هذا يضمن أن الفواتير والمستندات الجديدة تبدأ بالجنيه المصري
UPDATE public.company_settings 
SET currency = 'EGP' 
WHERE currency = 'SAR' OR currency IS NULL;

-- 7. تحديث نسبة الضريبة الافتراضية إلى 14% (مصر)
UPDATE public.company_settings 
SET vat_rate = 0.14 
WHERE vat_rate = 0.15 OR vat_rate = 15 OR vat_rate = 14;

-- 4. تنظيف البيانات الفاسدة (اختياري - يحذف التفاصيل التي ليس لها رأس)
-- DELETE FROM public.invoice_items WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
-- DELETE FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);

-- ============================================================
-- 🛡️ درع الحماية الشامل (The Shield)
-- ============================================================
-- تفعيل الحماية والتلقائية لجميع جداول العمليات لضمان عدم ضياع أي بيانات
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'accounts', 'products', 'customers', 'suppliers', 'warehouses', 'cost_centers', 'item_categories', 
        'company_settings', 'profiles', 'roles', 'role_permissions', 'orders', 'order_items', 'payments', 
        'shifts', 'journal_entries', 'journal_lines', 'invoices', 'invoice_items', 'purchase_invoices', 
        'purchase_invoice_items', 'sales_returns', 'sales_return_items', 'purchase_returns', 
        'purchase_return_items', 'debit_notes', 'credit_notes', 'receipt_vouchers', 
        'receipt_voucher_attachments', 'payment_vouchers', 'payment_voucher_attachments', 
        'cheques', 'cheque_attachments', 'bill_of_materials', 'opening_inventories', 
        'stock_transfers', 'stock_transfer_items', 'stock_adjustments', 'stock_adjustment_items', 
        'inventory_counts', 'inventory_count_items', 'work_orders', 'work_order_material_usage', 
        'mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 'mfg_production_orders', 
        'mfg_order_progress', 'mfg_step_materials', 'mfg_actual_material_usage', 
        'mfg_scrap_logs', 'mfg_production_variances', 'mfg_batch_serials', 
        'mfg_qc_inspections', 'mfg_material_requests', 'mfg_material_request_items', 
        'restaurant_tables', 'table_sessions', 'delivery_orders', 'kitchen_orders', 
        'payrolls', 'payroll_items', 'employee_allowances', 'payroll_variables', 
        'employee_advances', 'assets', 'notifications'        
    ];
    v_count_before int;
BEGIN 
    RAISE NOTICE '🛡️ بدء تفعيل درع الحماية الآلي (Unified RLS Shield)...';
    FOREACH t IN ARRAY tables LOOP
        -- 1. فحص وجود الجدول أولاً
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
           EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            
        
            EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t) INTO v_count_before;

            -- 2. تعبئة البيانات المفقودة فوراً
            IF v_count_before > 0 THEN
                EXECUTE format('UPDATE public.%I SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL', t);
                RAISE NOTICE '✅ الجدول [%]: تم ربط % سجل يتيم.', t, v_count_before;
            END IF;

            -- 4. تفعيل سياسة العزل (RLS Enforcement)
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Isolation_Policy_%I" ON public.%I', t, t);            
            -- السياسة الموحدة: تسمح بالوصول فقط للمنظمة النشطة للمستخدم

            EXECUTE format('CREATE POLICY "Isolation_Policy_%I" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org())', t, t);

            -- 5. صمام الأمان النهائي: منع القيم الفارغة مستقبلاً
            BEGIN
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '⚠️ الجدول [%]: تعذر فرض NOT NULL (قد توجد قيود تبعية).', t;
            END;
        END IF;

        -- معالجة خاصة لجدول الحسابات لضمان الأولوية

    END LOOP;
        RAISE NOTICE '✅ تم الانتهاء من تأمين كافة جداول النظام بنجاح.';

END $$;

-- 9. دالة التحقق من حالة الاشتراك لبروزة التنبيهات
DROP FUNCTION IF EXISTS public.check_subscription_status(uuid);
CREATE OR REPLACE FUNCTION public.check_subscription_status(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_expiry date; v_days_left int; v_is_active boolean;
BEGIN
    SELECT subscription_expiry, is_active INTO v_expiry, v_is_active 
    FROM public.organizations WHERE id = p_org_id;

    v_days_left := v_expiry - CURRENT_DATE;

    RETURN jsonb_build_object(
        'is_active', v_is_active,
        'expiry_date', v_expiry,
        'days_remaining', COALESCE(v_days_left, 0),
        'needs_alert', (v_days_left <= 7 AND v_days_left >= 0),
        'is_expired', (v_days_left < 0)
    );
END; $$;

-- 🔒 إضافة نظام حماية الحسابات السيادية (Account Protection System)

-- أ. دالة منع تعديل خصائص الحسابات الحساسة
CREATE OR REPLACE FUNCTION public.protect_system_accounts_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_protected_codes text[] := ARRAY[
        '1', '2', '3', '4', '5', '11', '12', '21', '22', '31', '41', '51', '52', '53',
        '103', '10301', '10302', '10303', '513', '514', '5121', '3999'
    ];
BEGIN
    -- التحقق مما إذا كان الحساب ضمن القائمة المحمية
    IF OLD.code = ANY(v_protected_codes) THEN
        -- 1. منع تغيير النوع (Type) لضمان صحة الميزانية وقائمة الدخل
        IF NEW.type <> OLD.type THEN
            RAISE EXCEPTION 'لا يمكن تغيير نوع الحساب السيادي (%) لضمان سلامة التقارير المالية.', OLD.code;
        END IF;
        
        -- 2. منع تغيير الكود (Code) لأن النظام يعتمد عليه في الربط الآلي
        IF NEW.code <> OLD.code THEN
            RAISE EXCEPTION 'لا يمكن تعديل كود الحساب السيادي (%). يرجى إنشاء حساب جديد بدلاً من ذلك.', OLD.code;
        END IF;

        -- 3. منع تغيير حالة المجموعة (is_group)
        IF NEW.is_group <> OLD.is_group THEN
            RAISE EXCEPTION 'لا يمكن تغيير طبيعة الحساب (رئيسي/فرعي) للحساب السيادي (%).', OLD.code;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ب. دالة منع الحذف النهائي للحسابات السيادية
CREATE OR REPLACE FUNCTION public.prevent_system_account_deletion_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.code = ANY(ARRAY['1','2','3','4','5','103','10301','10302','10303','513','5121','3999']) THEN
        RAISE EXCEPTION 'خطأ أمني: لا يمكن حذف حساب نظام أساسي (%). يمكنك فقط تعطيله إذا كان الرصيد صفراً.', OLD.code;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ج. إنشاء الـ Triggers
DROP TRIGGER IF EXISTS trg_protect_system_accounts ON public.accounts;
CREATE TRIGGER trg_protect_system_accounts
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.protect_system_accounts_fn();

DROP TRIGGER IF EXISTS trg_prevent_system_account_deletion ON public.accounts;
CREATE TRIGGER trg_prevent_system_account_deletion
BEFORE DELETE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.protect_system_accounts_fn();

COMMIT;

-- رسالة تأكيد
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;