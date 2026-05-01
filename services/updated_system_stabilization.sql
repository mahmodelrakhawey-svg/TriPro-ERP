-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-06-15 (V14 Enhanced SaaS Logic)
-- الوصف: تحصين القيود وصيانة البيانات وهيكل الجداول فقط.

-- ============================================================
-- 🛡️ محرك تحصين التكامل المرجعي (Global CASCADE Reinforcement)
-- الوصف: يقوم هذا الجزء بتحويل كافة قيود الجداول لدعم الحذف التلقائي
-- لمنع أخطاء (Foreign Key Violation) أثناء عمليات الاستعادة والحذف.
-- ============================================================
DO $$ 
DECLARE 
    r record;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name 
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = 'public'
          -- استثناء الجداول السيادية لـ Supabase
          AND ccu.table_name NOT IN ('users', 'audit_log')
          -- استثناء الأعمدة المالية التي يفضل فيها الـ SET NULL منعاً للحذف التسلسلي الكارثي
          AND kcu.column_name NOT IN ('related_journal_entry_id')
    ) LOOP
        -- تحصين القيود: الحقول التي تسبب اعتناء متبادل نجعلها SET NULL دائماً لضمان نجاح الاستعادة
        IF r.column_name IN ('default_treasury_id', 'default_warehouse_id', 'parent_id', 'approver_id', 'category_id', 'related_journal_entry_id', 'original_invoice_id', 'original_order_id', 'treasury_account_id', 'warehouse_id', 'responsible_user_id', 'category_id') THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE SET NULL',
                           r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
        ELSE
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE CASCADE',
                           r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
        END IF;
    END LOOP;
END $$;

-- 3. إصلاح تكرار SKU (لضمان استقرار المخزن)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku, organization_id ORDER BY created_at DESC) as rn
    FROM public.products
    WHERE deleted_at IS NULL AND sku IS NOT NULL
)
UPDATE public.products SET sku = sku || '-DUP-' || id::text WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 🛠️ تأمين جدول طلبات المطبخ (kitchen_orders) لبيئة الـ SaaS والمدراء
ALTER TABLE IF EXISTS public.kitchen_orders ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.kitchen_orders ALTER COLUMN organization_id SET NOT NULL; -- ✅ فرض عدم السماح بقيم NULL
ALTER TABLE public.kitchen_orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org(); -- ✅ تعيين قيمة افتراضية
-- ترميم البيانات: ربط طلبات المطبخ "اليتيمة" بالمنظمة بناءً على الطلب الأصلي
UPDATE public.kitchen_orders ko
SET organization_id = oi.organization_id
FROM public.order_items oi
WHERE ko.order_item_id = oi.id AND ko.organization_id IS NULL;

-- 🛠️ ترميم مديول التصنيع (MFG Data Integrity)
-- ربط السجلات القديمة بالمنظمة الحالية لتمكين حذفها أو عزلها
DO $$ 
BEGIN
    -- فحص وجود جداول التصنيع قبل محاولة الترميم (إصلاح الخطأ 42P01)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_production_orders') THEN
        UPDATE public.mfg_production_orders SET organization_id = public.get_my_org() WHERE organization_id IS NULL;
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_order_progress') THEN
            UPDATE public.mfg_order_progress po SET organization_id = orders.organization_id 
            FROM public.mfg_production_orders orders 
            WHERE po.production_order_id = orders.id AND po.organization_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_batch_serials') THEN
            UPDATE public.mfg_batch_serials bs SET organization_id = orders.organization_id 
            FROM public.mfg_production_orders orders 
            WHERE bs.production_order_id = orders.id AND bs.organization_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_actual_material_usage') THEN
            UPDATE public.mfg_actual_material_usage amu SET organization_id = op.organization_id 
            FROM public.mfg_order_progress op WHERE amu.order_progress_id = op.id AND amu.organization_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_scrap_logs') THEN
            UPDATE public.mfg_scrap_logs sl SET organization_id = op.organization_id 
            FROM public.mfg_order_progress op WHERE sl.order_progress_id = op.id AND sl.organization_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_material_requests') THEN
            UPDATE public.mfg_material_requests mr SET organization_id = po.organization_id 
            FROM public.mfg_production_orders po WHERE mr.production_order_id = po.id AND mr.organization_id IS NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_production_variances') THEN
            UPDATE public.mfg_production_variances pv SET organization_id = po.organization_id 
            FROM public.mfg_production_orders po WHERE pv.production_order_id = po.id AND pv.organization_id IS NULL;
        END IF;
    END IF;
END $$;

-- 1. جداول الطاولات والجلسات
ALTER TABLE IF EXISTS public.restaurant_tables ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE IF EXISTS public.table_sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- 2. تأمين عمود المنظمة في الجداول الأساسية ومنع القيم الفارغة
DO $$ BEGIN
    ALTER TABLE public.restaurant_tables ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.table_sessions ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
END $$;

-- 3. ترميم بيانات الطاولات والجلسات المفقودة (حالة الأدمن)
UPDATE public.restaurant_tables SET organization_id = public.get_my_org() WHERE organization_id IS NULL;

UPDATE public.table_sessions ts
SET organization_id = rt.organization_id
FROM public.restaurant_tables rt
WHERE ts.table_id = rt.id AND ts.organization_id IS NULL;

-- 4. ترميم الروابط المفقودة في الطلبات (Orders) لضمان ظهورها في المطبخ
UPDATE public.orders o
SET organization_id = COALESCE(
    (SELECT organization_id FROM public.table_sessions ts WHERE ts.id = o.session_id),
    p.organization_id
)
FROM public.profiles p
WHERE o.user_id = p.id 
AND o.organization_id IS NULL;

-- 5. ترميم بنود الطلبات (Order Items)
UPDATE public.order_items oi
SET organization_id = o.organization_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.organization_id IS NULL;

-- 6. ترميم طلبات المطبخ النهائية
UPDATE public.kitchen_orders ko
SET organization_id = oi.organization_id
FROM public.order_items oi
WHERE ko.order_item_id = oi.id AND ko.organization_id IS NULL;

ALTER TABLE IF EXISTS public.bill_of_materials 
DROP CONSTRAINT IF EXISTS bill_of_materials_raw_material_id_fkey,
ADD CONSTRAINT bill_of_materials_raw_material_id_fkey 
FOREIGN KEY (raw_material_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.quotation_items 
DROP CONSTRAINT IF EXISTS quotation_items_product_id_fkey,
ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey,
ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.receipt_vouchers 
DROP CONSTRAINT IF EXISTS receipt_vouchers_customer_id_fkey,
ADD CONSTRAINT receipt_vouchers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payment_vouchers 
DROP CONSTRAINT IF EXISTS payment_vouchers_supplier_id_fkey,
ADD CONSTRAINT payment_vouchers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_customer_id_fkey,
ADD CONSTRAINT credit_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.employee_advances 
DROP CONSTRAINT IF EXISTS employee_advances_employee_id_fkey,
ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payroll_items 
DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey,
ADD CONSTRAINT payroll_items_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.invoice_items 
DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey,
ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.sales_return_items 
DROP CONSTRAINT IF EXISTS sales_return_items_product_id_fkey,
ADD CONSTRAINT sales_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_invoice_items 
DROP CONSTRAINT IF EXISTS purchase_invoice_items_product_id_fkey,
ADD CONSTRAINT purchase_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_return_items 
DROP CONSTRAINT IF EXISTS purchase_return_items_product_id_fkey,
ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- 🛠️ معالجة القيود اليتيمة والمكررة لضمان مطابقة الأستاذ مع الفواتير
-- 1. ترميم الروابط المفقودة بناءً على رقم المرجع (في حال فقدان الـ UUID في القيود القديمة)
UPDATE public.journal_entries je
SET related_document_id = pi.id, related_document_type = 'purchase_invoice'
FROM public.purchase_invoices pi
WHERE je.reference = pi.invoice_number 
AND je.related_document_id IS NULL 
AND je.organization_id = pi.organization_id;

-- 2. توجيه الفواتير إلى القيد الأحدث (الأصح بعد التعديل)
UPDATE public.purchase_invoices pi
SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice' ORDER BY je.created_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice');

UPDATE public.invoices i
SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice' ORDER BY je.created_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice');

-- 3. حذف كافة القيود المكررة والإبقاء على الأحدث فقط لكل مستند
DELETE FROM public.journal_entries 
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id, related_document_id, related_document_type ORDER BY created_at DESC) as entry_rank
        FROM public.journal_entries
        WHERE related_document_id IS NOT NULL AND related_document_type IN ('purchase_invoice', 'invoice')
    ) sub WHERE entry_rank > 1
);

-- تنظيف مراجع القيود لضمان الربط الصحيح
UPDATE public.journal_entries SET related_document_type = 'cheque_collection'
WHERE (trim(reference) ILIKE 'COLL-%' OR trim(reference) ILIKE 'TRF-%' OR trim(reference) ILIKE 'CHQ-%') AND related_document_type IS NULL;

-- صيانة فهارس البحث
CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);

-- 🛡️ فهرس لتحسين أداء حذف والبحث عن القيود المرتبطة بالمستندات لضمان سرعة "نظام استبدال القيد"
CREATE INDEX IF NOT EXISTS idx_journal_entries_related_doc ON public.journal_entries (related_document_id, related_document_type);

-- مزامنة المتوسط المرجح للأصناف لضمان دقة التكلفة في الفواتير
UPDATE public.products SET weighted_average_cost = COALESCE(NULLIF(weighted_average_cost, 0), cost, purchase_price, 0);

-- ============================================================
-- 1. توحيد أسماء أعمدة المرتجعات (Schema Standardization)
-- ============================================================
DO $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['quotation_items', 'sales_return_items', 'purchase_invoice_items', 'purchase_order_items', 'purchase_return_items', 'invoice_items', 'order_items', 'modifiers'];
BEGIN
    -- توحيد مسمى سعر الوحدة في جميع جداول النظام
    FOREACH t IN ARRAY tables_to_fix LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'price') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'unit_price') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN price TO unit_price', t);
            ELSE
                EXECUTE format('UPDATE public.%I SET unit_price = COALESCE(price, 0) WHERE unit_price IS NULL OR unit_price = 0', t);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN price', t);
            END IF;
        END IF;
    END LOOP;

    -- ضمان عدم تكرار التصنيفات
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_categories_name_org_unique') THEN
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
        ALTER TABLE public.item_categories ADD CONSTRAINT item_categories_name_org_unique UNIQUE (organization_id, name);
    END IF;

    -- توحيد مسميات معرفات المرتجعات
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

    -- تحديث جدول أوامر التصنيع (work_orders) - إصلاح تقرير حركة الصنف
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='created_by') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='user_id') THEN
            ALTER TABLE public.work_orders RENAME COLUMN created_by TO user_id;
        ELSE
            UPDATE public.work_orders SET user_id = created_by WHERE user_id IS NULL;
            ALTER TABLE public.work_orders DROP COLUMN created_by;
        END IF;
    END IF;

    -- تحديث جدول بنود الطلبات (order_items)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='unit_price') THEN
            ALTER TABLE public.order_items RENAME COLUMN price TO unit_price;
        ELSE
            UPDATE public.order_items SET unit_price = price WHERE unit_price IS NULL;
            ALTER TABLE public.order_items DROP COLUMN price;
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

-- 1. إضافة الأعمدة لجدول المشتريات (في حال لم يتم تحديث الماستر)
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);


-- 2. دالة اعتماد فاتورة المشتريات مع دعم السداد الفوري (القيود الآلية)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid);
-- ============================================================
-- 2. إضافة أعمدة الـ SaaS والاشتراكات لجدول المنظمات
-- ============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting"}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expiry date;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS total_collected numeric DEFAULT 0;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_payment_date date;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS activity_type text;

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

-- ============================================================
-- 5. تحديثات الجداول المالية (Financial Linkage)
-- ============================================================
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS notes text;

-- إضافة أعمدة مفقودة تم رصدها في هيكل القاعدة الحالي لضمان التوافق
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS monthly_sales_target numeric DEFAULT 0;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);
ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS payroll_item_id uuid REFERENCES public.payroll_items(id);
ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash numeric DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS actual_cash numeric DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS difference numeric DEFAULT 0;
ALTER TABLE public.modifiers ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);

-- ربط المرتجعات بالفواتير
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS reference text; -- مطلوب لنظام الإشعارات
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id); -- مطلوب لنظام الإشعارات

-- تحديثات العملاء والمخزون
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS bill_requested boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; -- الحد الأدنى للتنبيه
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0; -- تكلفة الوجبات
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.item_categories(id) ON DELETE SET NULL;

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

ALTER TABLE public.company_settings ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.purchase_invoices ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.receipt_vouchers ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.payment_vouchers ALTER COLUMN currency SET DEFAULT 'EGP';

-- تهيئة المتوسط المرجح للأصناف الحالية لضمان عدم ظهور أصفار في تقرير الأرباح
UPDATE public.products 
SET weighted_average_cost = COALESCE(NULLIF(weighted_average_cost, 0), cost, purchase_price, 0)
WHERE weighted_average_cost IS NULL OR weighted_average_cost = 0;
UPDATE public.purchase_invoices SET supplier_id = (SELECT id FROM public.suppliers LIMIT 1) WHERE supplier_id IS NULL;
ALTER TABLE public.purchase_invoices ALTER COLUMN supplier_id SET NOT NULL;

-- ============================================================
-- 12. صمام أمان المستودعات للفواتير (Warehouse Safety Triggers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_ensure_document_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_invoice_warehouse ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_warehouse BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

-- ملاحظة: تم نقل تعريف الدوال البرمجية (Functions) إلى deploy_all_functionss.sql لضمان التجانس.
-- هنا نقوم فقط بتطبيق المشغلات (Triggers) لضمان استقرار البيئة.
DO $$ 
DECLARE 
    t text;
    tables_list text[];
BEGIN
    -- استخراج كافة جداول المخطط التي تحتوي على عمود organization_id
    -- مع استثناء الجداول الإدارية والسيادية لضمان استقرار النظام
    tables_list := ARRAY(
        SELECT c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema
        WHERE c.table_schema = 'public' 
        AND c.column_name = 'organization_id'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name NOT IN ('spatial_ref_sys', 'organizations', 'organization_backups', 'profiles', 'permissions', 'roles', 'role_permissions')
    );

    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_force_org_id ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_force_org_id 
                        BEFORE INSERT ON public.%I 
                        FOR EACH ROW EXECUTE FUNCTION public.fn_force_org_id_on_insert()', t);
    END LOOP;
END $$;