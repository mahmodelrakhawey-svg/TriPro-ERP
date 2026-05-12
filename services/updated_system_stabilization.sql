-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-06-15 (V14 Enhanced SaaS Logic)
-- الوصف: تحصين القيود وصيانة البيانات وهيكل الجداول فقط.

-- ============================================================
-- 🛡️ محرك تحصين التكامل المرجعي (Global CASCADE Reinforcement)
-- الوصف: يقوم هذا الجزء بتحويل كافة قيود الجداول لدعم الحذف التلقائي
-- لمنع أخطاء (Foreign Key Violation) أثناء عمليات الاستعادة والحذف.
-- ============================================================

-- 🛠️ ضمان وجود الجداول التوافقية لتقارير حركة المخزون (حل خطأ 404)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN
        CREATE TABLE public.work_orders (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            order_number text UNIQUE,
            product_id uuid REFERENCES public.products(id),
            quantity numeric DEFAULT 0,
            warehouse_id uuid REFERENCES public.warehouses(id),
            status text DEFAULT 'draft',
            organization_id uuid REFERENCES public.organizations(id),
            created_at timestamptz DEFAULT now(),
            end_date date
        );
    END IF;
END $$;

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
          -- استثناء الأعمدة المالية التي يفضل فيها الـ SET NULL منعاً للحذف التسلسلي الكارثي أو التي يتم تحديثها بواسطة دوال
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

-- ============================================================
-- 🦷 محرك تنظيف ودمج الحسابات المكررة (Deduplication Engine)
-- الوصف: يدمج الحسابات المكررة داخل الشركة الواحدة ويفرض القيد الفريد
-- ============================================================
DO $$ 
DECLARE 
    dup record;
BEGIN
    -- 1. البحث عن الحسابات المكررة (نفس الكود ونفس الشركة)
    FOR dup IN (
        SELECT organization_id, code, 
               (ARRAY_AGG(id ORDER BY created_at ASC))[1] as correct_id,
               (ARRAY_AGG(id ORDER BY created_at ASC))[2:] as wrong_ids
        FROM public.accounts 
        WHERE deleted_at IS NULL
        GROUP BY organization_id, code 
        HAVING COUNT(*) > 1
    ) LOOP
        -- 2. تحويل كافة الروابط من الحسابات الخاطئة إلى الحساب الصحيح
        UPDATE public.journal_lines SET account_id = dup.correct_id WHERE account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET inventory_account_id = dup.correct_id WHERE inventory_account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET cogs_account_id = dup.correct_id WHERE cogs_account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET sales_account_id = dup.correct_id WHERE sales_account_id = ANY(dup.wrong_ids);
        UPDATE public.invoices SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.purchase_invoices SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.receipt_vouchers SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.payment_vouchers SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.shifts SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.employee_advances SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        
        -- 3. تصحيح علاقة الأب والابن في شجرة الحسابات
        UPDATE public.accounts SET parent_id = dup.correct_id WHERE parent_id = ANY(dup.wrong_ids);

        -- 4. حذف النسخ المكررة نهائياً
        DELETE FROM public.accounts WHERE id = ANY(dup.wrong_ids);
    END LOOP;

    -- 5. فرض القيد الفريد (Unique Constraint) لمنع المشكلة للأبد
    -- نحذف القيود القديمة أولاً لضمان التحديث
    ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;
    ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_organization_id_code_key;
    
    -- القيد الذهبي: لا يمكن تكرار الكود داخل نفس المنظمة
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code);
    
    RAISE NOTICE '✅ تمت عملية دمج الحسابات المكررة بنجاح وتم فرض القيد الفريد.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ تنبيه: تعذر فرض القيد الفريد، ربما لا تزال هناك بيانات مكررة تحتاج مراجعة يدوية: %', SQLERRM;
END $$;

-- ============================================================
-- 🛡️ تحصين أعمدة المنظمة (SaaS Infrastructure)
-- الوصف: إضافة عمود المنظمة للجداول المالية والمخزنية قبل بدء المعالجة
-- ============================================================
DO $$ 
DECLARE 
    t text;
    tables_to_ensure text[] := ARRAY[
        'journal_entries', 'journal_lines', 'journal_attachments',
        'purchase_invoices', 'purchase_invoice_items', 'purchase_return_items',
        'purchase_orders', 'purchase_order_items', 'purchase_returns', 'purchase_return_items',
        'sales_returns', 'sales_return_items',
        'invoices', 'invoice_items', 'sales_return_items',
        'customers', 'suppliers', 'products', 'accounts', 'warehouses',
        'sales_orders', 'sales_order_items',
        'item_categories', 'orders', 'order_items', 'work_orders', 'company_settings',
        'cost_centers', 'employees', 'payrolls', 'payroll_items', 
        'employee_advances', 'profiles', 'shifts',
        'receipt_vouchers', 'receipt_voucher_attachments', 
        'payment_vouchers', 'payment_voucher_attachments', 
        'cheques', 'cheque_attachments',
        'stock_adjustments', 'stock_adjustment_items',
        'inventory_counts', 'inventory_count_items',
        'stock_transfers', 'stock_transfer_items',
        'opening_inventories', 'credit_notes', 'debit_notes',
        'work_orders', 'work_order_costs',
        'mfg_work_centers', 'mfg_routings', 'mfg_routing_steps',
        'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials',
        'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials',
        'mfg_production_variances', 'mfg_material_requests', 'mfg_material_request_items',
        'kitchen_orders', 'restaurant_tables', 'table_sessions', 'menu_categories',
        'modifier_groups', 'modifiers', 'organization_backups', 'invitations',
        'quotations', 'quotation_items',
        'roles', 'role_permissions', 'notifications', 'notification_preferences',
        'assets', 'delivery_orders', 'payments'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_ensure LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 🛡️ تحصين هيكل الجداول المالية (Financial Schema Reinforcement)
-- الوصف: إضافة الأعمدة اللازمة قبل بدء عمليات ترميم البيانات
-- ============================================================
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS production_warehouse_id uuid;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS raw_material_warehouse_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN 
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(19,4) DEFAULT 1;
        ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0; -- 🛡️ إضافة عمود tax_rate لـ invoice_items
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques') THEN 
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN 
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF;
    -- توحيد مسمى رقم الطلب في المشتريات لضمان عمل الواجهة
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'po_number') THEN
        ALTER TABLE public.purchase_orders RENAME COLUMN po_number TO order_number;
    END IF;    

    -- توحيد مسمى عمود الربط في بنود أوامر الشراء
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'purchase_order_id') THEN
        ALTER TABLE public.purchase_order_items RENAME COLUMN purchase_order_id TO order_id;
    END IF;
END $$;

-- Add currency to receipt_vouchers and payment_vouchers
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers') THEN 
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers') THEN 
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
    END IF;
END $$;

-- 3. إصلاح تكرار SKU (لضمان استقرار المخزن)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku, organization_id ORDER BY created_at DESC) as rn
    FROM public.products
    WHERE deleted_at IS NULL AND sku IS NOT NULL
)
UPDATE public.products SET sku = sku || '-DUP-' || id::text WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. ترميم مديول المطبخ (Kitchen Orders)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_orders') THEN
        UPDATE public.kitchen_orders ko SET organization_id = oi.organization_id
        FROM public.order_items oi WHERE ko.order_item_id = oi.id AND ko.organization_id IS NULL;
        
        ALTER TABLE public.kitchen_orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    END IF;
END $$;

-- ⚙️ تريجر مزامنة إجمالي الطلب التلقائي
CREATE OR REPLACE FUNCTION public.sync_order_grand_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.grand_total := COALESCE(NEW.subtotal, 0) + COALESCE(NEW.total_tax, 0) + COALESCE(NEW.delivery_fee, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_totals ON public.orders;
CREATE TRIGGER trg_sync_order_totals
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_grand_total();

-- 1. جداول الطاولات والجلسات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_sessions') THEN ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id); END IF;
    -- تحصين مديول التصنيع
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN 
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
        ALTER TABLE public.orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
        
        -- 🛡️ تصحيح آمن لجدول الجلسات: التحقق من الوجود قبل التغيير لتجنب الأخطاء عند إعادة التشغيل
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'opened_at') THEN ALTER TABLE public.table_sessions RENAME COLUMN opened_at TO start_time; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'closed_at') THEN ALTER TABLE public.table_sessions RENAME COLUMN closed_at TO end_time; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'opened_by') THEN ALTER TABLE public.table_sessions RENAME COLUMN opened_by TO user_id; END IF;
    END IF;    
END $$;

-- 2. تأمين عمود المنظمة في الجداول الأساسية ومنع القيم الفارغة
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_sessions') THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN RETURN; END IF;

    ALTER TABLE public.restaurant_tables ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.table_sessions ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
END $$;

-- 3. محرك ترميم الهوية (Identity Repair)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN
        UPDATE public.restaurant_tables
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;
END $$;


UPDATE public.orders o
SET organization_id = COALESCE(
    o.organization_id,
    (SELECT organization_id FROM public.table_sessions ts WHERE ts.id = o.session_id),
    (SELECT organization_id FROM public.profiles p WHERE p.id = o.user_id),
    public.get_my_org()
)
WHERE o.organization_id IS NULL;

UPDATE public.order_items oi
SET organization_id = o.organization_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.organization_id IS NULL;

-- 4. ترميم الروابط المفقودة في الطلبات لضمان ظهور المبالغ في تقارير الإغلاق (Fix for Super Admin)
DO $$ BEGIN
    UPDATE public.orders o
    SET organization_id = COALESCE(
        o.organization_id,
        (SELECT organization_id FROM public.table_sessions ts WHERE ts.id = o.session_id),
        (SELECT organization_id FROM public.profiles p WHERE p.id = o.user_id)
    )
    WHERE o.organization_id IS NULL;

    UPDATE public.order_items oi
    SET organization_id = o.organization_id
    FROM public.orders o
    WHERE oi.order_id = o.id AND oi.organization_id IS NULL;
END $$;

-- 5. ترميم بنود الطلبات (Order Items)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        UPDATE public.order_items oi
        SET organization_id = o.organization_id
        FROM public.orders o
        WHERE oi.order_id = o.id AND oi.organization_id IS NULL;
    END IF;
END $$;

ALTER TABLE IF EXISTS public.bill_of_materials 
DROP CONSTRAINT IF EXISTS bill_of_materials_raw_material_id_fkey,
ADD CONSTRAINT bill_of_materials_raw_material_id_fkey FOREIGN KEY (raw_material_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.quotation_items 
DROP CONSTRAINT IF EXISTS quotation_items_product_id_fkey,
ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey, ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE; -- هذا السطر لم يعد يحتاج لتغيير اسم العمود هنا، فقط في master_setup

ALTER TABLE IF EXISTS public.receipt_vouchers 
DROP CONSTRAINT IF EXISTS receipt_vouchers_customer_id_fkey, ADD CONSTRAINT receipt_vouchers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payment_vouchers 
DROP CONSTRAINT IF EXISTS payment_vouchers_supplier_id_fkey, ADD CONSTRAINT payment_vouchers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_customer_id_fkey, ADD CONSTRAINT credit_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.employee_advances 
DROP CONSTRAINT IF EXISTS employee_advances_employee_id_fkey, ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payroll_items 
DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey, ADD CONSTRAINT payroll_items_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.invoice_items 
DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey, ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.sales_return_items 
DROP CONSTRAINT IF EXISTS sales_return_items_product_id_fkey, ADD CONSTRAINT sales_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_invoice_items 
DROP CONSTRAINT IF EXISTS purchase_invoice_items_product_id_fkey, ADD CONSTRAINT purchase_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_return_items 
DROP CONSTRAINT IF EXISTS purchase_return_items_product_id_fkey, ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- 🛠️ معالجة القيود اليتيمة والمكررة لضمان مطابقة الأستاذ مع الفواتير
-- 1. ترميم الروابط المفقودة بناءً على رقم المرجع (في حال فقدان الـ UUID في القيود القديمة)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        UPDATE public.journal_entries je
        SET related_document_id = pi.id, related_document_type = 'purchase_invoice'
        FROM public.purchase_invoices pi
        WHERE je.reference = pi.invoice_number 
        AND je.related_document_id IS NULL 
        AND je.organization_id = pi.organization_id;
    END IF;
END $$;

-- 2. توجيه الفواتير إلى القيد الأحدث (الأصح بعد التعديل)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.purchase_invoices pi
        SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice' ORDER BY je.created_at DESC LIMIT 1)
        WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.invoices i
        SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice' ORDER BY je.created_at DESC LIMIT 1)
        WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice');
    END IF;
END $$;
-- 3. حذف كافة القيود المكررة والإبقاء على الأحدث فقط لكل مستند
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        DELETE FROM public.journal_entries 
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id, related_document_id, related_document_type ORDER BY created_at DESC) as entry_rank
                FROM public.journal_entries
                WHERE related_document_id IS NOT NULL AND related_document_type IN ('purchase_invoice', 'invoice')
            ) sub WHERE entry_rank > 1
        );
    END IF;
END $$;

-- تنظيف مراجع القيود لضمان الربط الصحيح
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.journal_entries SET related_document_type = 'cheque_collection'
        WHERE (trim(reference) ILIKE 'COLL-%' OR trim(reference) ILIKE 'TRF-%' OR trim(reference) ILIKE 'CHQ-%') AND related_document_type IS NULL;
    END IF;
END $$;
-- صيانة فهارس البحث
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN
        CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);
    END IF;
END $$;
-- 🛡️ فهرس لتحسين أداء حذف والبحث عن القيود المرتبطة بالمستندات لضمان سرعة "نظام استبدال القيد"
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        CREATE INDEX IF NOT EXISTS idx_journal_entries_related_doc ON public.journal_entries (related_document_id, related_document_type);
    END IF;
END $$;

-- مزامنة المتوسط المرجح للأصناف لضمان دقة التكلفة في الفواتير
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        UPDATE public.products SET weighted_average_cost = COALESCE(NULLIF(weighted_average_cost, 0), cost, purchase_price, 0);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
        UPDATE public.purchase_invoices SET supplier_id = (SELECT id FROM public.suppliers LIMIT 1) WHERE supplier_id IS NULL;
        ALTER TABLE public.purchase_invoices ALTER COLUMN supplier_id SET NOT NULL;
    END IF;
END $$;
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
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
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

    -- توحيد أعمدة فواتير المشتريات (purchase_invoices) لضمان التوافق مع الواجهة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS due_date date;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS notes text;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
        
        -- حل مشكلة created_by: نجعلها عموداً عادياً لمرونة الإدخال
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='created_by' AND is_generated = 'ALWAYS') THEN
            ALTER TABLE public.purchase_invoices DROP COLUMN created_by;
        END IF;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS created_by uuid;
    END IF;

    -- تحديث جدول الفواتير (invoices) - إصلاح تقرير حركة الصنف
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        -- إضافة الأعمدة المالية الأساسية إذا فقدت
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date;
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
    END IF;

    -- 1. ضمان وجود عمود user_id (المسمى الموحد الجديد) بشكل مستقل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='user_id') THEN
        ALTER TABLE public.invoices ADD COLUMN user_id uuid REFERENCES public.profiles(id);
    END IF;

    -- 2. نقل البيانات من created_by القديم إلى user_id وإعادة تسمية القديم للشفافية
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='created_by' AND is_generated = 'NEVER') THEN
        -- نقل البيانات
        UPDATE public.invoices SET user_id = created_by WHERE user_id IS NULL;
        
        -- حذف القيود القديمة لإتاحة إعادة التسمية
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'invoices' AND constraint_name LIKE '%created_by_fkey%') THEN
            ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='_deprecated_created_by') THEN
            EXECUTE 'ALTER TABLE public.invoices RENAME COLUMN created_by TO _deprecated_created_by';
        END IF;
    END IF;

    -- 3. إعادة إنشاء created_by كعمود "افتراضي" يعكس user_id دائماً لضمان عمل الواجهة الأمامية
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='created_by') THEN
        -- نستخدم EXECUTE لضمان أن المترجم يرى عمود user_id الجديد
        EXECUTE 'ALTER TABLE public.invoices ADD COLUMN created_by uuid GENERATED ALWAYS AS (user_id) STORED';
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

-- ============================================================
-- 2. إضافة أعمدة الـ SaaS والاشتراكات لجدول المنظمات
-- ============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expiry date;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspension_reason text;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS total_collected numeric DEFAULT 0;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_payment_date date;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS activity_type text;
    END IF;
END $$;

-- ============================================================
-- 3. تحديث إعدادات الشركة (Company Settings)
-- ============================================================
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS max_cash_deficit_limit numeric DEFAULT 500;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS activity_type text;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings') THEN
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS monthly_sales_target numeric DEFAULT 0;
    END IF;
END $$;

-- تحديث جدول التصنيفات (fix_item_categories_description)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS description text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS image_url text; END IF;
END $$;
-- ضمان القيد الفريد لجدول الإعدادات
DO $$ BEGIN
    ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_organization_id_unique;
    ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_organization_id_unique UNIQUE (organization_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping settings unique constraint'; END $$;

-- ============================================================
-- 5. تحديثات الجداول المالية (Financial Linkage)
-- ============================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques') THEN ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_count_items') THEN ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS notes text; END IF;
END $$;

-- إضافة أعمدة مفقودة تم رصدها في هيكل القاعدة الحالي لضمان التوافق
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assets') THEN ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS payroll_item_id uuid REFERENCES public.payroll_items(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_items') THEN ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS actual_cash numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS difference numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modifiers') THEN ALTER TABLE public.modifiers ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN 
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; 
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS available_modifiers jsonb DEFAULT '[]'::jsonb;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_serial boolean DEFAULT false;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_price numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_start_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_end_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_max_qty numeric;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id); END IF;
END $$;

-- ربط المرتجعات بالفواتير
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_returns') THEN ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_returns') THEN ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS reference text; END IF; -- مطلوب لنظام الإشعارات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id); END IF; -- مطلوب لنظام الإشعارات
END $$;

-- تحديثات العملاء والمخزون
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN 
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS bill_requested boolean DEFAULT false; 
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS session_start timestamptz;
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS section text;
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock_level numeric DEFAULT 5; END IF; -- الحد الأدنى للتنبيه
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; END IF; -- الحد الأدنى للتنبيه
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0; END IF; -- تكلفة الوجبات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]'::jsonb; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url text; 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'info'; 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_id uuid; 
    END IF; -- 🛠️ إصلاح شامل لأعمدة الإشعارات (PGRST204)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.item_categories(id) ON DELETE SET NULL; END IF;
END $$;

-- تحديثات مديول الرواتب (Payroll Sync)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') THEN ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payrolls') THEN ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'; END IF;
    -- 🛠️ تحصين جدول الموظفين وإصلاح قيود الأسماء (Stabilization Fix)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') THEN 
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notes text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS position text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
        
        -- إزالة قيود NOT NULL المسببة للأخطاء
        ALTER TABLE public.employees ALTER COLUMN name DROP NOT NULL;
        ALTER TABLE public.employees ALTER COLUMN full_name DROP NOT NULL;

        -- مزامنة البيانات التاريخية
        UPDATE public.employees SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
        UPDATE public.employees SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_items') THEN ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0; END IF;
    -- 🛠️ تحصين جدول السلف وإصلاح خطأ ENCES (Stabilization Fix)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN 
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS request_date date DEFAULT now();
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS reference text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(); END IF;
END $$;

-- 🛠️ إصلاح أرصدة التصنيع اليتيمة (Fixing Orphaned Manufacturing Stock)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_production_orders') THEN
        UPDATE public.mfg_production_orders po
        SET warehouse_id = (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
        WHERE warehouse_id IS NULL AND status = 'completed';
    END IF;
END $$;

-- ⚙️ تريجر مزامنة أسماء الموظفين (Double-Naming Guard)
CREATE OR REPLACE FUNCTION public.fn_sync_employee_names()
RETURNS TRIGGER AS $$
BEGIN
    NEW.full_name := COALESCE(NEW.full_name, NEW.name);
    NEW.name := COALESCE(NEW.name, NEW.full_name);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_emp_names ON public.employees;
CREATE TRIGGER trg_sync_emp_names
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_employee_names();

-- ============================================================
-- 6. إصلاح نظام الإشعارات (Notifications Fix)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
                ALTER TABLE public.notifications RENAME COLUMN notification_type TO "type";
            ELSE
                -- If both exist, ensure 'type' is the primary and drop 'notification_type' if it's redundant
                -- Or, if 'notification_type' is still used, ensure it's nullable if 'type' is preferred.
                -- For now, just ensure 'notification_type' is nullable if 'type' exists to avoid conflicts.
                ALTER TABLE public.notifications ALTER COLUMN notification_type DROP NOT NULL;
            END IF;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create notifications' AND tablename = 'notifications') THEN
            CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.get_my_role() != 'demo');
        END IF;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings') THEN ALTER TABLE public.company_settings ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers') THEN ALTER TABLE public.receipt_vouchers ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers') THEN ALTER TABLE public.payment_vouchers ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
END $$;

-- تهيئة المتوسط المرجح للأصناف الحالية لضمان عدم ظهور أصفار في تقرير الأرباح

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

-- ============================================================
-- 🛡️ دالة فرض معرف المنظمة (Force Organization ID Function)
-- الوصف: تضمن هذه الدالة تعيين organization_id تلقائياً عند الإدراج
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_force_org_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := public.get_my_org();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_invoice_warehouse ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_warehouse BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();


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
        AND c.table_name NOT IN ('spatial_ref_sys', 'organizations', 'organization_backups', 'profiles', 'permissions', 'roles', 'role_permissions', 'security_logs')
    );

    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_force_org_id ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_force_org_id 
                        BEFORE INSERT ON public.%I 
                        FOR EACH ROW EXECUTE FUNCTION public.fn_force_org_id_on_insert()', t);
    END LOOP;

    -- 🛡️ ترميم بيانات عروض الأسعار اليتيمة (في حال وجدت)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotations') THEN
        ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS expiry_date date;
        ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
        
        UPDATE public.quotations 
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotation_items') THEN
        UPDATE public.quotation_items qi
        SET organization_id = q.organization_id
        FROM public.quotations q
        WHERE qi.quotation_id = q.id AND qi.organization_id IS NULL;
    END IF;

    -- 🛡️ ترميم بيانات أوامر الشراء اليتيمة (في حال وجدت)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
        UPDATE public.purchase_orders 
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
        UPDATE public.purchase_order_items poi
        SET organization_id = po.organization_id
        FROM public.purchase_orders po
        WHERE poi.order_id = po.id AND poi.organization_id IS NULL;
    END IF;
END $$;
-- 🚀 تحديث ذاكرة المخطط لضمان تعرف الـ API على التغييرات فوراً
NOTIFY pgrst, 'reload config';
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح وتحديث ذاكرة المخطط.' as status;
