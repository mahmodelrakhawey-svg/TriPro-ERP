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

-- ربط الفواتير والشيكات بالقيود المحاسبية
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);

-- ربط المرتجعات بالفواتير الأصلية
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);

-- إضافة معرف المنظمة لجدول المدفوعات (ضروري لتقارير الورديات وحماية RLS)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.payments ALTER COLUMN organization_id SET DEFAULT public.get_my_org();

-- 🛠️ تصحيح البيانات القديمة: ربط المدفوعات بالشركة بناءً على الطلب الأصلي
UPDATE public.payments p
SET organization_id = o.organization_id
FROM public.orders o
WHERE p.order_id = o.id AND p.organization_id IS NULL;

-- ضمان تعبئة أي قيم NULL متبقية قبل فرض القيد (Fallback للمدفوعات اليتيمة)
UPDATE public.payments SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL;

-- إضافة تسلسل (Sequence) لأرقام الطلبات إذا لم يوجد
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

-- إضافة عمود الضريبة المضافة لجدول بنود الطلب لضمان دقة التقارير
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14;

-- إغلاق الثغرة: منع القيم الفارغة في المدفوعات مستقبلاً
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE organization_id IS NULL) THEN
        ALTER TABLE public.payments ALTER COLUMN organization_id SET NOT NULL;
    END IF;
END $$;

-- التأكد من وجود معرف الشركة في جدول الورديات (Shifts) إذا وجد
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shifts' AND column_name = 'organization_id') THEN
            ALTER TABLE public.shifts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
        END IF;
        
        UPDATE public.shifts SET organization_id = public.get_my_org() WHERE organization_id IS NULL;
        
        -- تفعيل الحماية لجدول الورديات لضمان عزل البيانات
        EXECUTE 'ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Shifts isolation policy" ON public.shifts';
        EXECUTE 'CREATE POLICY "Shifts isolation policy" ON public.shifts FOR ALL TO authenticated USING (organization_id = public.get_my_org())';
    END IF;
END $$;

-- تفعيل الحماية لجدول المدفوعات لضمان ظهوره في التقارير
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;
CREATE POLICY "Payments isolation policy" ON public.payments FOR ALL TO authenticated USING (organization_id = public.get_my_org());

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

-- 3. التأكد من وجود الحسابات المحاسبية الحرجة (لتجنب أخطاء القيود الآلية)
-- أوراق القبض (1204)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active)
SELECT gen_random_uuid(), '1204', 'أوراق القبض (شيكات)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '102' LIMIT 1), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1204') AND EXISTS (SELECT 1 FROM accounts WHERE code = '102');

-- أوراق الدفع (2202)
INSERT INTO public.accounts (id, code, name, type, is_group, parent_id, is_active)
SELECT gen_random_uuid(), '2202', 'أوراق الدفع', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '2' LIMIT 1), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2202') AND EXISTS (SELECT 1 FROM accounts WHERE code = '2');

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
    tables text[] := ARRAY['accounts', 'products', 'customers', 'suppliers', 'warehouses', 'cost_centers', 'orders', 'order_items', 'payments', 'shifts', 'journal_entries', 'journal_lines', 'invoices', 'receipt_vouchers', 'payment_vouchers'];
    v_count_before int;
BEGIN 
    RAISE NOTICE '🛡️ جاري مراجعة وتأمين درع الحماية لجميع الجداول...';
    FOREACH t IN ARRAY tables LOOP
        -- 1. التأكد من وجود العمود وتعيين القيمة الافتراضية
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) AND t != 'accounts' THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            
            -- حساب السجلات التي تحتاج ربط قبل التحديث
            EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t) INTO v_count_before;

            -- 2. تعبئة البيانات المفقودة فوراً
            EXECUTE format('UPDATE public.%I SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL', t);
            
            IF v_count_before > 0 THEN
                RAISE NOTICE '✅ الجدول [%]: تم ربط % سجل مفقود بالمنظمة بنجاح.', t, v_count_before;
            END IF;

            -- 3. تفعيل RLS (نظام العزل)
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Isolation_Policy_%I" ON public.%I', t, t);
            EXECUTE format('CREATE POLICY "Isolation_Policy_%I" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org())', t, t);

            -- 4. القفل النهائي: منع القيم الفارغة للأبد (Enforcement)
            -- هذا سيضمن أن أي محاولة إدخال بيانات بدون معرف شركة ستفشل فوراً قبل وصولها للجداول
            BEGIN
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '⚠️ ملاحظة: تعذر فرض NOT NULL على الجدول % (قد يحتاج لتنظيف يدوي)', t;
            END;
        END IF;

        -- معالجة خاصة لجدول الحسابات لضمان الأولوية
        IF t = 'accounts' THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'organization_id') THEN
                ALTER TABLE public.accounts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
                UPDATE public.accounts SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL;
                RAISE NOTICE '✅ تم إصلاح عمود المنظمة في جدول الحسابات.';
            END IF;
            ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Isolation_Policy_accounts" ON public.accounts;
            CREATE POLICY "Isolation_Policy_accounts" ON public.accounts FOR ALL TO authenticated USING (organization_id = public.get_my_org());
        END IF;
    END LOOP;
END $$;

COMMIT;

-- رسالة تأكيد
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;