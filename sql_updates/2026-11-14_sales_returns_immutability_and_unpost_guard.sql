-- ==============================================================================
-- 🛡️ TriPro ERP — حصانة مرتجعات المبيعات والتحصين الرقابي الشامل
-- الملف: sql_updates/2026-11-14_sales_returns_immutability_and_unpost_guard.sql
--
-- 📋 الغرض من الملف:
--   تنفيذ وتثبيت حزمة الحصانة المحاسبية لمرتجعات المبيعات (Sales Returns Immutability)
--   لمنع أي تعديل أو حذف عشوائي على المرتجعات المرحلة وحماية الأستاذ العام والمخزون،
--   وتوفير دورة مستندية نظامية لإلغاء الترحيل (Unpost) للمصرح لهم فقط.
--
-- 🎯 المحتويات الأساسية:
--   1. دالة إلغاء ترحيل مرتجع المبيعات (unpost_sales_return) للمديرين والمحاسبين فقط مع عكس المخزون والقيود.
--   2. دالة الحذف الآمن لمرتجع المبيعات (delete_sales_return) مع حظر حذف أي مرتجع مرحل.
--   3. صمامات أمان حظر التعديل المباشر (Document Immutability Triggers) على جداول المرتجعات وبنودها.
--   4. تحديث دالة اعتماد وترحيل مرتجع المبيعات (approve_sales_return) لتتوافق مع نظام الحصانة.
--   5. روتين فحص وربط القيود المحاسبية القائمة وتحديث كاش واجهة البرمجة (pgrst reload).
-- ==============================================================================

BEGIN;

-- 0. تفعيل تصريح تعديل القيود المالية للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'true', true);

-- ==============================================================================
-- 1. دالة إلغاء ترحيل مرتجع المبيعات (unpost_sales_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unpost_sales_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
    v_base_qty numeric;
BEGIN
    -- أ. التحقق من وجود المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المبيعات غير موجود (ID: %)', p_return_id;
    END IF;

    -- إذا كان مسودة بالفعل فلا حاجة للإلغاء
    IF v_return.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني الصارم من صلاحيات المستخدم المتصل (مقتصر على المحاسبين والمديرين)
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل مرتجع المبيعات. هذه العملية مقتصرة على الإدارة والمحاسبين فقط.';
        END IF;

        IF v_return.organization_id IS NOT NULL 
           AND v_return.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لتجاوز محفزات الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    -- ب. عكس أثر المخزون: خصم الكميات التي كانت قد أضيفت عند الإرجاع
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.sales_return_items 
        WHERE sales_return_id = p_return_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_return.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty),
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_return.warehouse_id::text],
                    to_jsonb(GREATEST(0, COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_base_qty))
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty)
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- ج. حذف القيد المحاسبي المرتبط من الأستاذ العام
    v_journal_id := v_return.related_journal_entry_id;

    IF v_journal_id IS NULL THEN
        SELECT id INTO v_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_return_id AND related_document_type = 'sales_return')
           OR (reference = v_return.return_number)
        LIMIT 1;
    END IF;

    IF v_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
    END IF;

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries WHERE reference = v_return.return_number
    );
    DELETE FROM public.journal_entries WHERE reference = v_return.return_number;

    -- د. تحويل حالة المرتجع إلى مسودة (draft)
    UPDATE public.sales_returns
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 2. دالة الحذف الآمن لمرتجع المبيعات (delete_sales_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_sales_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_org_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    SELECT status, organization_id INTO v_status, v_org_id
    FROM public.sales_returns 
    WHERE id = p_return_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المبيعات غير موجود (ID: %)', p_return_id;
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المبيعات.';
        END IF;
    END IF;

    -- منع حذف المرتجع المرحل
    IF v_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن حذف مرتجع مبيعات مرحل (%s). يجب إلغاء ترحيله أولاً لإعادته كمسودة ثم حذفه.', v_status;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    DELETE FROM public.sales_return_items WHERE sales_return_id = p_return_id;
    DELETE FROM public.sales_returns WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_sales_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_sales_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 3. صمامات الأمان لحظر التعديل المباشر (Document Immutability Triggers)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_sales_returns_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
    EXCEPTION WHEN OTHERS THEN
        v_bypass := 'false';
    END;

    IF v_bypass = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status NOT IN ('draft', 'cancelled') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: مرتجع المبيعات محصن قانونياً ولا يمكن حذفه أثناء ترحيله. يرجى استخدام زر إلغاء الترحيل أولاً.';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status NOT IN ('draft', 'cancelled') AND NEW.status NOT IN ('draft', 'cancelled') THEN
            IF (NEW.customer_id IS DISTINCT FROM OLD.customer_id) OR
               (NEW.total_amount IS DISTINCT FROM OLD.total_amount) OR
               (NEW.return_date IS DISTINCT FROM OLD.return_date) OR
               (NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id) THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن تعديل بيانات مرتجع المبيعات بعد ترحيله للأستاذ العام. يرجى إلغاء الترحيل أولاً.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_returns_immutability ON public.sales_returns;
CREATE TRIGGER trg_guard_sales_returns_immutability
BEFORE UPDATE OR DELETE ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_sales_returns_immutability();


CREATE OR REPLACE FUNCTION public.fn_guard_sales_return_items_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_status text;
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
    EXCEPTION WHEN OTHERS THEN
        v_bypass := 'false';
    END;

    IF v_bypass = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT status INTO v_parent_status
    FROM public.sales_returns
    WHERE id = COALESCE(NEW.sales_return_id, OLD.sales_return_id);

    IF v_parent_status IS NOT NULL AND v_parent_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: بنود مرتجع المبيعات محصنة ومرحلة بالمخازن والأستاذ العام ولا يمكن تعديلها أو حذفها مباشرة.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_return_items_immutability ON public.sales_return_items;
CREATE TRIGGER trg_guard_sales_return_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.sales_return_items
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_sales_return_items_immutability();


-- ==============================================================================
-- 4. تحديث دالة اعتماد مرتجع المبيعات (approve_sales_return) مع الحماية المحاسبية
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_sales_return_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric := 0;
    v_mappings jsonb;
BEGIN
    -- 1. التحقق من وجود المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    v_org_id := v_return.organization_id;

    -- 🛡️ تفعيل إذن تعديل القيود
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 2. جلب الحسابات المحاسبية من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_return_acc_id := COALESCE(
        (v_mappings->>'SALES_RETURNS')::uuid,
        (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1),
        (v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)
    );
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث أرصدة المخزون وحساب التكلفة الإجمالية
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        DECLARE 
            v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert') THEN
                v_base_qty := COALESCE(public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)), v_item.quantity);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;

            v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_base_qty);

            -- تحديث رصيد المنتج والمستودع
            UPDATE public.products 
            SET stock = stock + v_item.quantity,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb), 
                    ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], 
                    to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)
                )
            WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- 4. تنظيف القيد القديم المرتبط إن وجد
    IF v_return.related_journal_entry_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_return.related_journal_entry_id;
    END IF;
    
    DELETE FROM public.journal_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number);
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number;

    -- 5. إنشاء قيد اليومية العام
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true)
    RETURNING id INTO v_journal_id;

    -- 6. أسطر القيد المالي
    -- أ. مردودات ومسموحات مبيعات (مدين)
    IF v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);
    END IF;

    -- ب. ضريبة القيمة المضافة مخرجات (مدين - عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id);
    END IF;

    -- ج. العملاء (دائن - تخفيض مديونية)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    END IF;

    -- 7. أسطر قيد الجرد المستمر (مدين: مخزون 10302 / دائن: تكلفة مبيعات 511)
    IF v_total_cost > 0 THEN
        FOR v_item IN 
            SELECT 
                COALESCE(p.inventory_account_id, v_inv_acc_id) as inv_acc,
                COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
                SUM(COALESCE(p.cost, p.weighted_average_cost, p.purchase_price, 0) * sri.quantity) as total_item_cost
            FROM public.sales_return_items sri
            JOIN public.products p ON sri.product_id = p.id
            WHERE sri.sales_return_id = p_return_id
            GROUP BY COALESCE(p.inventory_account_id, v_inv_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
        LOOP
            IF v_item.total_item_cost > 0 AND v_item.inv_acc IS NOT NULL AND v_item.cogs_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.inv_acc, v_item.total_item_cost, 0, 'مخزون المنتج التام - مرتجع مبيعات', v_org_id);

                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.cogs_acc, 0, v_item.total_item_cost, 'عكس تكلفة مبيعات', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 8. تحديث حالة المرتجع وربطه بالقيد الجديد
    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;

    -- 9. إغلاق تصريح التعديل
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_sales_return(uuid) TO authenticated, service_role;


-- ==============================================================================
-- 5. روتين الفحص والربط التلقائي وتحديث كاش قاعدة البيانات
-- ==============================================================================
DO $$
DECLARE
    v_dup record;
    v_count int := 0;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- ربط أي مرتجع مبيعات مرحل لا يملك related_journal_entry_id بقيده الصحيح إن وجد
    FOR v_dup IN
        SELECT sr.id, sr.return_number, je.id AS j_id
        FROM public.sales_returns sr
        JOIN public.journal_entries je ON (je.related_document_id = sr.id AND je.related_document_type = 'sales_return')
                                       OR (je.reference = sr.return_number)
        WHERE sr.status = 'posted'
          AND sr.related_journal_entry_id IS NULL
    LOOP
        UPDATE public.sales_returns
        SET related_journal_entry_id = v_dup.j_id
        WHERE id = v_dup.id;
        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'TriPro Security Guard: Sales returns immutability installed successfully. Verified % returns.', v_count;
END $$;

COMMIT;

-- إغلاق تصريح التعديل المحاسبي للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'false', false);
NOTIFY pgrst, 'reload schema';
