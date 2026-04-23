-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-06-10 (SaaS Core Optimization v17)
-- الوصف: تحسين التوافق مع تعدد الشركات ودعم المستخدم العالمي (Super Admin) لضمان استقرار النظام.

BEGIN;

-- ============================================================
-- 0. إصلاح الدوال الأساسية للهوية (Core Identity Functions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE _org_id uuid;
BEGIN
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN _org_id;
EXCEPTION 
    WHEN OTHERS THEN 
        RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', '')::text,
        (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    );
EXCEPTION WHEN OTHERS THEN 
    RETURN 'viewer';
END; $$;

-- ترميم: إسناد الطلبات التي ليس لها مستودع إلى المستودع الرئيسي للشركة
UPDATE public.orders o
SET warehouse_id = (SELECT id FROM public.warehouses w WHERE w.organization_id = o.organization_id AND deleted_at IS NULL LIMIT 1)
WHERE warehouse_id IS NULL;

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

-- 2.1 التطهير الجذري للمستندات (Document Purge)
-- نحذف أي مستند مكرر فوراً لنتمكن من تفعيل "القفل الحديدي" Unique Constraint
DELETE FROM public.receipt_vouchers WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY organization_id, voucher_number ORDER BY created_at DESC
        ) as rank
        FROM public.receipt_vouchers WHERE voucher_number IS NOT NULL AND voucher_number != ''
    ) t WHERE rank > 1
);

DELETE FROM public.payment_vouchers WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY voucher_number, organization_id ORDER BY created_at DESC) as rank
        FROM public.payment_vouchers WHERE voucher_number IS NOT NULL AND voucher_number != ''
    ) t WHERE rank > 1
);

DELETE FROM public.invoices WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY invoice_number, organization_id ORDER BY created_at DESC) as rank
        FROM public.invoices WHERE invoice_number IS NOT NULL AND invoice_number != ''
    ) t WHERE rank > 1
);

-- 2.1 توجيه السندات إلى القيد الأحدث (Winning Entry) قبل حذف المكررات لفك الارتباط
UPDATE public.receipt_vouchers rv
SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = rv.id AND je.related_document_type = 'receipt_voucher' ORDER BY je.created_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = rv.id AND je.related_document_type = 'receipt_voucher');

UPDATE public.payment_vouchers pv
SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = pv.id AND je.related_document_type = 'payment_voucher' ORDER BY je.created_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = pv.id AND je.related_document_type = 'payment_voucher');

-- 3. حذف كافة القيود المكررة والإبقاء على الأحدث فقط لكل مستند
-- 3. حذف كافة القيود المكررة والإبقاء على الأحدث فقط (تنظيف جراحي شامل)
DELETE FROM public.journal_entries 
WHERE id IN (
    SELECT id FROM (
        SELECT id, 
               ROW_NUMBER() OVER (PARTITION BY COALESCE(related_document_id::text, reference), organization_id ORDER BY created_at DESC) as entry_rank
        FROM public.journal_entries 
        WHERE (related_document_id IS NOT NULL OR (reference IS NOT NULL AND reference != ''))
    ) t WHERE entry_rank > 1
);

-- إعادة حساب كافة أرصدة العملاء لضمان المطابقة مع كشف الحساب
UPDATE public.customers SET balance = public.get_customer_balance(id, organization_id);

-- ترميم روابط السندات بالقيود (في حال كان السند مسجلاً ولكن غير مربوط بالقيد)
-- ضمان ترحيل كافة المستندات اليتيمة قبل حساب الأرصدة
SELECT public.recalculate_all_system_balances(id) FROM public.organizations;

-- تنظيف مراجع القيود لضمان الربط الصحيح
UPDATE public.journal_entries SET related_document_type = 'cheque_collection' 
WHERE (trim(reference) ILIKE 'COLL-%' OR trim(reference) ILIKE 'TRF-%' OR trim(reference) ILIKE 'CHQ-%') AND related_document_type IS NULL;

-- صيانة فهارس البحث
CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);

-- 🛡️ فهرس لتحسين أداء حذف والبحث عن القيود المرتبطة بالمستندات لضمان سرعة "نظام استبدال القيد"
CREATE INDEX IF NOT EXISTS idx_journal_entries_related_doc ON public.journal_entries (related_document_id, related_document_type);

-- إعادة احتساب أرصدة المخزون بالمنطق المطور (شامل استهلاك المطعم والتصنيع)
SELECT public.recalculate_stock_rpc(id) FROM public.organizations;

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

-- ============================================================
-- 🛠️ نظام معالجة الدفع الفوري في فواتير المشتريات
-- ============================================================

-- 1. إضافة الأعمدة لجدول المشتريات (في حال لم يتم تحديث الماستر)
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);


-- 2. دالة اعتماد فاتورة المشتريات مع دعم السداد الفوري (القيود الآلية)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid);
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_inv record;
    v_je_id uuid;
    v_org_id uuid;
    v_mappings jsonb;
    v_supplier_acc_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
BEGIN
    SELECT * INTO v_inv FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF v_inv IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    v_org_id := v_inv.organization_id;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار أو التضارب بعد التعديل
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- جلب روابط الحسابات من الإعدادات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي الصحيح)
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE (code = '10301' OR code = '103') AND organization_id = v_org_id ORDER BY code DESC LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));

    -- صمام أمان: التأكد من وجود الحسابات قبل إنشاء القيد
    IF v_supplier_acc_id IS NULL OR v_inventory_acc_id IS NULL OR v_vat_acc_id IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على الحسابات المطلوبة (الموردين أو المخزون أو الضريبة) في دليل الحسابات.';
    END IF;

    -- أ. إنشاء القيد الرئيسي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (v_inv.invoice_date, 'فاتورة مشتريات رقم: ' || v_inv.invoice_number, v_inv.invoice_number, 'posted', v_org_id, true, v_inv.id, 'purchase_invoice')
    RETURNING id INTO v_je_id;

    -- ب. جانب المدين: المشتريات والضريبة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_inventory_acc_id, v_inv.subtotal, 0, 'مشتريات - فاتورة ' || v_inv.invoice_number, v_org_id);
    IF COALESCE(v_inv.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, v_inv.tax_amount, 0, 'ضريبة مدخلات - فاتورة ' || v_inv.invoice_number, v_org_id);
    END IF;

    -- ج. جانب الدائن: المورد (بكامل القيمة) ثم المدين (بالمسدد فوري)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_supplier_acc_id, 0, v_inv.total_amount, 'استحقاق مورد - فاتورة ' || v_inv.invoice_number, v_org_id);

    IF COALESCE(v_inv.paid_amount, 0) > 0 AND v_inv.treasury_account_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_supplier_acc_id, v_inv.paid_amount, 0, 'سداد فوري - فاتورة ' || v_inv.invoice_number, v_org_id);
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_inv.treasury_account_id, 0, v_inv.paid_amount, 'صرف نقدية سداد فوري - فاتورة ' || v_inv.invoice_number, v_org_id);
    END IF;

    UPDATE public.purchase_invoices SET related_journal_entry_id = v_je_id, status = 'posted' WHERE id = v_inv.id;
    PERFORM public.update_single_supplier_balance(v_inv.supplier_id);
    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة (مثل نظام المبيعات)
    PERFORM public.recalculate_stock_rpc(v_org_id);
    RETURN v_je_id;
END; $$;

-- 3. تحديث دالة رصيد المورد لتأخذ في الاعتبار "المسدد فوري" من إجمالي الفاتورة
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_balance numeric := 0;
DECLARE v_org_id uuid;
DECLARE v_supplier_name text;
BEGIN
    SELECT organization_id, name INTO v_org_id, v_supplier_name FROM public.suppliers WHERE id = p_supplier_id;

    -- 1. الرصيد الافتتاحي
    SELECT COALESCE(opening_balance, 0) INTO v_balance FROM public.suppliers WHERE id = p_supplier_id;

    -- 2. الدائن: فواتير المشتريات (يُضاف الصافي المتبقي فقط: الإجمالي - المدفوع فورياً)
    SELECT v_balance + COALESCE(SUM(total_amount - paid_amount), 0) INTO v_balance 
    FROM public.purchase_invoices WHERE supplier_id = p_supplier_id AND status != 'draft';

    -- 3. المدين: سندات الصرف المنفصلة
    SELECT v_balance - COALESCE(SUM(amount), 0) INTO v_balance 
    FROM public.payment_vouchers WHERE supplier_id = p_supplier_id;

    -- 4. المدين: المرتجعات والإشعارات
    SELECT v_balance - COALESCE(SUM(total_amount), 0) INTO v_balance 
    FROM public.purchase_returns WHERE supplier_id = p_supplier_id AND status = 'posted';
    SELECT v_balance - COALESCE(SUM(total_amount), 0) INTO v_balance 
    FROM public.debit_notes WHERE supplier_id = p_supplier_id AND status = 'posted';

    -- 4.5 المدين: الشيكات الصادرة (المقبولة فقط)
    SELECT v_balance - COALESCE(SUM(amount), 0) INTO v_balance 
    FROM public.cheques WHERE party_id = p_supplier_id AND type = 'outgoing' AND status != 'rejected';

    -- 5. القيود اليدوية والموردين (المقيدة باسم المورد)
    SELECT v_balance + COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_org_id AND je.status = 'posted' AND je.related_document_id IS NULL
    AND (trim(je.reference) NOT ILIKE 'COLL-%' AND trim(je.reference) NOT ILIKE 'TRF-%')
    AND (a.code LIKE '201%' OR a.code LIKE '221%')
    AND (je.description ILIKE '%' || v_supplier_name || '%');

    UPDATE public.suppliers SET balance = v_balance WHERE id = p_supplier_id;
END; $$;

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

-- استثناء لجدول المنظمات
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_select_policy" ON public.organizations;
CREATE POLICY "org_select_policy" ON public.organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "org_update_policy" ON public.organizations;
CREATE POLICY "org_update_policy" ON public.organizations FOR UPDATE TO authenticated USING ((id = public.get_my_org() AND public.get_my_role() IN ('admin', 'super_admin')) OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "org_delete_policy" ON public.organizations;
CREATE POLICY "org_delete_policy" ON public.organizations FOR DELETE TO authenticated USING (public.get_my_role() = 'super_admin');

-- استثناء لجدول المستخدمين (رؤية وتحديث لإدارة المنصة)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- حذف جميع السياسات القديمة لتجنب التعارض
DO $$ 
DECLARE
    v_pol_sql text;
BEGIN
    SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.profiles;', ' ') 
    INTO v_pol_sql
    FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public';
    
    IF v_pol_sql IS NOT NULL THEN
        EXECUTE v_pol_sql;
    END IF;
END $$;

-- السياسات الصحيحة والآمنة لجدول المستخدمين
DROP POLICY IF EXISTS "profiles_select_v2" ON public.profiles;
CREATE POLICY "profiles_select_v2" ON public.profiles FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR id = auth.uid() OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "profiles_update_v2" ON public.profiles;
CREATE POLICY "profiles_update_v2" ON public.profiles FOR ALL TO authenticated USING (public.get_my_role() = 'super_admin' OR (public.get_my_role() = 'admin' AND organization_id = public.get_my_org()) OR id = auth.uid()) WITH CHECK (public.get_my_role() = 'super_admin' OR (public.get_my_role() = 'admin' AND organization_id = public.get_my_org()) OR id = auth.uid());
DROP POLICY IF EXISTS "profiles_insert_v2" ON public.profiles;
CREATE POLICY "profiles_insert_v2" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = 'super_admin' OR public.get_my_role() = 'admin');

-- ============================================================
-- 5. تحديثات الجداول المالية (Financial Linkage)
-- ============================================================
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); -- 🛡️ إصلاح خطأ دالة إعادة المطابقة
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS notes text; -- ملاحظات بنود الجرد

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

-- ============================================================
-- 7. تهيئة التسلسلات والعملات (Localization)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
-- إجبار النظام على استخدام العملة والضريبة المصرية
UPDATE public.company_settings SET currency = 'EGP', vat_rate = 0.14 WHERE currency IS NULL OR currency = 'SAR';
ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.purchase_invoices ALTER COLUMN currency SET DEFAULT 'EGP';

-- تنظيف أي جلسات معلقة أو بيانات غير مرتبطة بمنظمة
DELETE FROM public.profiles WHERE organization_id IS NULL AND role != 'super_admin';

ALTER TABLE public.company_settings ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.purchase_invoices ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.receipt_vouchers ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.payment_vouchers ALTER COLUMN currency SET DEFAULT 'EGP';

-- تهيئة المتوسط المرجح للأصناف الحالية لضمان عدم ظهور أصفار في تقرير الأرباح
UPDATE public.products 
SET weighted_average_cost = COALESCE(NULLIF(weighted_average_cost, 0), cost, purchase_price, 0)
WHERE weighted_average_cost IS NULL OR weighted_average_cost = 0;

-- ============================================================
-- 13. تأمين إلزامية المورد في المشتريات (Supplier Enforcement)
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_ensure_purchase_warehouse ON public.purchase_invoices;
CREATE TRIGGER trg_ensure_purchase_warehouse BEFORE INSERT ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

-- ============================================================
-- 11. ربط تلقائي لطلبات الـ QR بالكاشير عند الدفع
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_assign_cashier_to_qr_order()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تغيرت الحالة إلى مدفوع والطلب ليس له صاحب، نربطه بالمستخدم الحالي الذي أجرى التعديل
    IF NEW.status IN ('PAID', 'COMPLETED') AND NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_cashier ON public.orders;
CREATE TRIGGER trg_assign_cashier
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_cashier_to_qr_order();

-- ============================================================
-- 10. فرض اختيار المستودع تلقائياً للطلبات (Auto-Warehouse Enforcement)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_ensure_order_warehouse()
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

DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
CREATE TRIGGER trg_ensure_order_warehouse
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_ensure_order_warehouse();

-- ============================================================
-- 9. تحديث دالة إغلاق الوردية الشاملة (Unified Shift Closing)
-- ============================================================
-- تضمن هذه الدالة إثبات العجز/الزيادة + خصم المخزون بالتكلفة في قيد واحد
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_actual_cash_collected numeric := 0;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
    WITH shift_orders AS (
        SELECT id, subtotal, total_tax FROM public.orders
        WHERE (user_id = v_shift.user_id OR user_id IS NULL) 
        AND status IN ('COMPLETED', 'PAID', 'posted') AND organization_id = v_shift.organization_id
        AND created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    )
    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((SELECT SUM(itms.quantity * COALESCE(NULLIF(itms.unit_cost, 0), (SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) FROM public.products WHERE id = itms.product_id AND organization_id = v_shift.organization_id LIMIT 1))) FROM public.order_items itms WHERE itms.order_id IN (SELECT id FROM shift_orders)), 0) as cost_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_total
    INTO v_summary
    FROM shift_orders;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_shift.organization_id;
    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_card_acc_id := COALESCE((v_mappings->>'BANK_ACCOUNTS')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_shift.organization_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_shift.organization_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_shift.organization_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_shift.organization_id LIMIT 1));
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'إغلاق وردية شامل - ID: ' || substring(p_shift_id::text, 1, 8), 'SHIFT-' || to_char(now(), 'YYMMDD'), 'posted', v_shift.organization_id, true, p_shift_id, 'shift') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيراد مبيعات الوردية', v_shift.organization_id);
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_shift.organization_id); END IF;
    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    v_actual_cash_collected := v_summary.cash_total + v_diff;
    IF v_actual_cash_collected > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cash_acc_id, v_actual_cash_collected, 0, 'النقدية الفعلية', v_shift.organization_id); END IF;
    IF v_summary.card_total > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_card_acc_id, v_summary.card_total, 0, 'متحصلات شبكة', v_shift.organization_id); END IF;
    IF v_diff < 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_shift.organization_id LIMIT 1), ABS(v_diff), 0, 'عجز نقدية', v_shift.organization_id);
    ELSIF v_diff > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '421' AND organization_id = v_shift.organization_id LIMIT 1), 0, v_diff, 'زيادة نقدية', v_shift.organization_id); END IF;
    IF v_summary.cost_total > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_cogs_acc_id, v_summary.cost_total, 0, 'تكلفة مبيعات الوردية', v_shift.organization_id), 
               (v_je_id, v_inventory_acc_id, 0, v_summary.cost_total, 'صرف مخزون الوردية', v_shift.organization_id); 
    END IF;
    RETURN v_je_id;
END; $$;

-- ============================================================
-- 9. إصلاح تقرير مبيعات المطعم (Restaurant Report Type Fix)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    item_name text,
    category_name text,
    quantity numeric,
    total_sales numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.name::text as item_name,
        COALESCE(cat.name::text, 'غير مصنف'::text) as category_name,
        SUM(oi.quantity)::numeric as quantity,
        SUM(oi.total_price)::numeric as total_sales
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.products p ON oi.product_id = p.id
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE o.organization_id = p_org_id
      AND o.status IN ('COMPLETED', 'PAID', 'posted')
      AND o.created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY p.name, cat.name
    ORDER BY total_sales DESC;
END;
$$;

-- 📊 تقرير الوجبات التي لم يتم ربطها بمكونات (BOM) لضبط التكاليف
CREATE OR REPLACE FUNCTION public.get_products_without_bom(p_org_id uuid)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    sku text,
    category_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(cat.name, 'غير مصنف')
    FROM public.products p
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.product_type = 'STOCK'
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = p.id);
END; $$;

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
        'assets', 'employees', 'payrolls', 'payroll_items', 'notifications',
        'modifier_groups', 'modifiers', 'order_item_modifiers',
        'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items',
        'quotations', 'quotation_items', 'purchase_orders', 'purchase_order_items',
        'bill_of_materials', 'opening_inventories', 'restaurant_tables', 'table_sessions'
    ];
    v_count_before int;
    v_is_menu_table boolean;
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
            
            -- تحديد جداول المنيو المسموح للمشاهدين (Viewer) برؤيتها
            v_is_menu_table := t IN ('products', 'item_categories', 'menu_categories', 'modifiers', 'modifier_groups', 'restaurant_tables', 'bill_of_materials');

            IF v_is_menu_table THEN
                EXECUTE format('CREATE POLICY "Select_Policy_%I" ON public.%I FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');', t, t);
            ELSIF t != 'organizations' THEN
                -- الجداول الحساسة: السوبر أدمن، أو الأدمن/المحاسب في منظمته
                EXECUTE format('CREATE POLICY "Select_Policy_%I" ON public.%I FOR SELECT TO authenticated USING (
                    public.get_my_role() = ''super_admin'' 
                    OR (organization_id = public.get_my_org() AND public.get_my_role() NOT IN (''viewer'', ''demo''))
                );', t, t);
            END IF;
            
            EXECUTE format('CREATE POLICY "Modify_Policy_%I" ON public.%I FOR ALL TO authenticated USING (
                (SELECT public.get_my_role()) = ''super_admin'' 
                OR (organization_id = (SELECT public.get_my_org()) AND (SELECT public.get_my_role()) IN (''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''))
            ) WITH CHECK (
                (SELECT public.get_my_role()) = ''super_admin'' 
                OR (organization_id = (SELECT public.get_my_org()) AND (SELECT public.get_my_role()) IN (''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''))
            );', t, t);

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
            
            CREATE POLICY "Select_Policy_accounts" ON public.accounts FOR SELECT TO authenticated USING ((organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') AND public.get_my_role() NOT IN ('viewer', 'demo'));
            CREATE POLICY "Modify_Policy_accounts" ON public.accounts FOR ALL TO authenticated USING ((organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') AND public.get_my_role() NOT IN ('demo', 'viewer')) WITH CHECK ((organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin') AND public.get_my_role() NOT IN ('demo', 'viewer'));
        END IF;
    END LOOP;
    -- ضمان عدم تكرار أرقام الفواتير والسندات لكل منظمة (القفل الحديدي)
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_number_org_unique;
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_number_org_unique UNIQUE (organization_id, invoice_number);

    ALTER TABLE public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_number_org_unique;
    ALTER TABLE public.sales_returns ADD CONSTRAINT sales_returns_number_org_unique UNIQUE (organization_id, return_number);

    ALTER TABLE public.purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_number_org_unique;
    ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_number_org_unique UNIQUE (organization_id, return_number);

    ALTER TABLE public.purchase_invoices DROP CONSTRAINT IF EXISTS purchase_invoices_number_org_unique;
    ALTER TABLE public.purchase_invoices ADD CONSTRAINT purchase_invoices_number_org_unique UNIQUE (organization_id, invoice_number);

    ALTER TABLE public.receipt_vouchers DROP CONSTRAINT IF EXISTS receipt_vouchers_number_org_unique;
    ALTER TABLE public.receipt_vouchers ADD CONSTRAINT receipt_vouchers_number_org_unique UNIQUE (organization_id, voucher_number);

END $$;

-- 🚀 تنشيط كاش النظام لضمان تعرف الـ API على الأعمدة الجديدة فوراً
-- تأكيد تنشيط الكاش وتحديث البنية البرمجية
SELECT public.refresh_saas_schema();
NOTIFY pgrst, 'reload config';
ANALYZE public.order_items;
ANALYZE public.products;

COMMIT;
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح. النظام جاهز للعمل.' as status;