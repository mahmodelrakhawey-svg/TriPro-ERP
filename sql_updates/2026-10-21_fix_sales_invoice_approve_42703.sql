-- =============================================================================
-- 🚑 إصلاح خطأ 42703: column "account_id" does not exist
--    عند اعتماد / ترحيل فاتورة المبيعات (post_sales_invoice / approve_invoice)
--
-- السبب الجذري:
--   توجد نسخ قديمة متعددة (overloads) من دالة approve_invoice في قاعدة البيانات:
--     - approve_invoice(uuid)          -- نسخة قديمة تستدعي كودًا تالفًا
--     - approve_invoice(uuid,uuid,uuid,boolean) -- نسخة v50 بمعامل p_skip_recalc
--     - approve_invoice(uuid,uuid,uuid)    -- النسخة الصحيحة الحديثة
--   كذلك المشغل trg_auto_approve_invoice يستدعي approve_invoice(NEW.id)
--   وهي النسخة أحادية المعامل التالفة، مما يسبب حلقة تكرارية بسياق منظمة خاطئ.
--
-- الحل:
--   1. حذف جميع overloads لـ approve_invoice و post_sales_invoice ديناميكيًا
--   2. إعادة إنشاء المشغلَين بحارس إعادة الدخول (re-entrancy guard)
--   3. إعادة إنشاء الدالتين بالإصدار الصحيح الموحد (3 معاملات فقط)
-- =============================================================================

-- خطوة 0: ضبط بيئة الأمان للتنفيذ
SET search_path = public;
SET session_replication_role = DEFAULT;

-- =============================================================================
-- STEP 1: حذف جميع overloads الموجودة لـ approve_invoice و post_sales_invoice
-- =============================================================================
DO $$
DECLARE
    r RECORD;
    v_sql TEXT;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS func_sig
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('approve_invoice', 'post_sales_invoice')
        ORDER BY p.pronargs DESC
    LOOP
        v_sql := format('DROP FUNCTION IF EXISTS %s CASCADE;', r.func_sig);
        RAISE NOTICE 'Dropping: %', v_sql;
        BEGIN
            EXECUTE v_sql;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop %, skipping: %', r.func_sig, SQLERRM;
        END;
    END LOOP;
END $$;

-- =============================================================================
-- STEP 2: إسقاط وإعادة إنشاء مشغلات الاعتماد التلقائي بحارس إعادة الدخول
-- =============================================================================

-- إسقاط المشغلات القديمة
DROP TRIGGER IF EXISTS trg_auto_approve_invoice       ON public.invoices;
DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
DROP FUNCTION IF EXISTS public.fn_auto_approve_invoice_on_insert()       CASCADE;
DROP FUNCTION IF EXISTS public.fn_auto_approve_invoice_on_items_insert() CASCADE;

-- دالة المشغل الرئيسية (على الفاتورة) — مع حارس إعادة الدخول
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- حارس إعادة الدخول: لا تنفَّذ إذا كانت دالة approve_invoice هي من يحدّث الحالة
    -- (الدالة تضبط app.allow_financial_ledger_mutation = 'true' قبل UPDATE invoices)
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- نُشغّل الاعتماد التلقائي فقط عند:
    --   1. الحالة الجديدة 'posted'
    --   2. لا يوجد قيد محاسبي مرتبط بعد (تحاشيًا لإعادة الحساب)
    --   3. الفاتورة من نوع مبيعات
    IF NEW.status = 'posted'
       AND NEW.related_journal_entry_id IS NULL
       AND COALESCE(NEW.type, '') = 'sale'
    THEN
        PERFORM public.approve_invoice(
            NEW.id,
            NEW.organization_id,
            NEW.warehouse_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

-- دالة المشغل على بنود الفاتورة — مع حارس إعادة الدخول
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- حارس إعادة الدخول
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.invoices
        WHERE id = NEW.invoice_id
          AND status = 'posted'
          AND related_journal_entry_id IS NULL
          AND COALESCE(type, '') = 'sale'
    ) THEN
        PERFORM public.approve_invoice(
            NEW.invoice_id,
            (SELECT organization_id FROM public.invoices WHERE id = NEW.invoice_id),
            (SELECT warehouse_id    FROM public.invoices WHERE id = NEW.invoice_id)
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();

-- =============================================================================
-- STEP 3: إعادة إنشاء approve_invoice — الإصدار الموحد النهائي (3 معاملات)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id   uuid,
    p_org_id       uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice              record;
    v_item                 record;
    v_org_id               uuid;
    v_wh_id                uuid;
    v_base_qty             numeric;
    v_inventory_acc_id     uuid;
    v_cogs_acc_id          uuid;
    v_vat_acc_id           uuid;
    v_customer_acc_id      uuid;
    v_sales_acc_id         uuid;
    v_discount_acc_id      uuid;
    v_journal_id           uuid;
    v_mappings             jsonb;
    v_total_cost           numeric  := 0;
    v_discount_amount      numeric  := 0;
    v_sales_credit         numeric  := 0;
    v_entry_diff           numeric  := 0;
    v_locked_stock         numeric;
    v_locked_wh_stock      jsonb;
    v_available_wh_stock   numeric;
    v_allow_negative_stock boolean  := false;
BEGIN
    -- جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- الفاتورة مرحّلة مسبقًا — لا نعيد الترحيل
    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي (يمنع المشغل trg_auto_approve_invoice من الاستدعاء الحلقي)
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- تحديد المنظمة
    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة لفاتورة المبيعات.';
    END IF;

    -- إعدادات السماح بالمخزون السالب
    SELECT COALESCE(allow_negative_stock, false)
    INTO   v_allow_negative_stock
    FROM   public.company_settings
    WHERE  organization_id = v_org_id
    LIMIT  1;
    v_allow_negative_stock := COALESCE(v_allow_negative_stock, false);

    -- تحديد المستودع
    v_wh_id := COALESCE(
        p_warehouse_id,
        v_invoice.warehouse_id,
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1)
    );

    -- جلب الربط المحاسبي
    SELECT account_mappings
    INTO   v_mappings
    FROM   public.company_settings
    WHERE  organization_id = v_org_id;

    v_inventory_acc_id := COALESCE(
        (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid,
        (v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('103','10301','1105') AND organization_id = v_org_id LIMIT 1)
    );
    v_cogs_acc_id := COALESCE(
        (v_mappings->>'COGS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('501','5101','511') AND organization_id = v_org_id LIMIT 1)
    );
    v_vat_acc_id := COALESCE(
        (v_mappings->>'VAT_OUTPUT')::uuid,
        (v_mappings->>'VAT')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('202','2103','20201') AND organization_id = v_org_id LIMIT 1)
    );
    v_customer_acc_id := COALESCE(
        (v_mappings->>'CUSTOMERS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('102','1102','10201') AND organization_id = v_org_id LIMIT 1)
    );
    v_sales_acc_id := COALESCE(
        (v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('401','4101','411') AND organization_id = v_org_id LIMIT 1)
    );

    -- حساب خصم المبيعات / العروض الترويجية
    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('413','4102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مسموح به%' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1)
    ));

    -- إنشاء حساب الخصم تلقائيًا إذا لم يوجد
    IF v_discount_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('413', 'خصم مسموح به وعروض ترويجية', 'revenue', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_discount_acc_id;

        IF v_discount_acc_id IS NULL THEN
            SELECT id INTO v_discount_acc_id
            FROM   public.accounts
            WHERE  organization_id = v_org_id AND code = '413'
            LIMIT  1;
        END IF;
    END IF;

    -- احتساب مبلغ الخصم / العروض (الفرق بين الإجمالي قبل وبعد الخصم)
    v_discount_amount := GREATEST(
        (COALESCE(v_invoice.subtotal, 0) + COALESCE(v_invoice.tax_amount, 0))
            - COALESCE(v_invoice.total_amount, 0),
        COALESCE(v_invoice.discount_amount, 0),
        COALESCE(v_invoice.promo_discount,  0),
        0
    );

    -- =========================================================
    -- فحص وخصم المخزون مع القفل المتشائم (Pessimistic Lock)
    -- =========================================================
    FOR v_item IN
        SELECT
            ii.*,
            p.product_type,
            p.base_uom_id,
            COALESCE(
                NULLIF(p.weighted_average_cost, 0),
                NULLIF(p.cost, 0),
                p.purchase_price,
                ii.cost,
                0
            ) AS item_cost
        FROM   public.invoice_items ii
        JOIN   public.products      p  ON ii.product_id = p.id
        WHERE  ii.invoice_id = p_invoice_id
    LOOP
        SELECT stock, warehouse_stock
        INTO   v_locked_stock, v_locked_wh_stock
        FROM   public.products
        WHERE  id = v_item.product_id
        FOR UPDATE;

        -- تحويل وحدة القياس
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_proc
                WHERE  proname = 'uom_convert'
                  AND  pronamespace = 'public'::regnamespace
            ) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, v_item.uom_id, v_item.base_uom_id
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF COALESCE(v_base_qty, 0) <= 0 THEN
            v_base_qty := GREATEST(v_item.quantity, 0);
        END IF;

        -- خصم المخزون للأصناف غير الخدمية فقط
        IF COALESCE(v_item.product_type, 'product') <> 'service' THEN
            IF NOT v_allow_negative_stock THEN
                IF v_wh_id IS NOT NULL THEN
                    v_available_wh_stock := COALESCE(
                        (v_locked_wh_stock->>v_wh_id::text)::numeric, 0
                    );
                    IF v_available_wh_stock < v_base_qty THEN
                        RAISE EXCEPTION
                            'الرصيد غير كافٍ في المستودع للصنف: % (المطلوب: %, المتوفر: %)',
                            v_item.item_name, v_base_qty, v_available_wh_stock;
                    END IF;
                ELSE
                    IF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                        RAISE EXCEPTION
                            'الرصيد الإجمالي غير كافٍ للصنف: % (المطلوب: %, المتوفر: %)',
                            v_item.item_name, v_base_qty, COALESCE(v_locked_stock, 0);
                    END IF;
                END IF;
            END IF;

            v_total_cost := v_total_cost + (v_base_qty * COALESCE(v_item.item_cost, 0));
            UPDATE public.invoice_items SET cost = v_item.item_cost WHERE id = v_item.id;

            IF v_wh_id IS NOT NULL THEN
                UPDATE public.products
                SET
                    stock           = COALESCE(stock, 0) - v_base_qty,
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_wh_id::text],
                        to_jsonb(
                            COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0)
                            - v_base_qty
                        )
                    )
                WHERE id = v_item.product_id;
            ELSE
                UPDATE public.products
                SET stock = COALESCE(stock, 0) - v_base_qty
                WHERE id = v_item.product_id;
            END IF;
        END IF;
    END LOOP;

    -- =========================================================
    -- إلغاء ترحيل ومسح أي قيود سابقة مرتبطة بالفاتورة
    -- =========================================================
    UPDATE public.journal_entries
    SET    status    = 'draft',
           is_posted = false
    WHERE  (related_document_id = p_invoice_id AND related_document_type = 'invoice')
        OR id = v_invoice.related_journal_entry_id
        OR (reference = v_invoice.invoice_number
            AND organization_id = v_org_id
            AND reference IS NOT NULL);

    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE  (related_document_id = p_invoice_id AND related_document_type = 'invoice')
            OR id = v_invoice.related_journal_entry_id
            OR (reference = v_invoice.invoice_number
                AND organization_id = v_org_id
                AND reference IS NOT NULL)
    );

    DELETE FROM public.journal_entries
    WHERE  (related_document_id = p_invoice_id AND related_document_type = 'invoice')
        OR id = v_invoice.related_journal_entry_id
        OR (reference = v_invoice.invoice_number
            AND organization_id = v_org_id
            AND reference IS NOT NULL);

    -- =========================================================
    -- إنشاء القيد المحاسبي الجديد (مسودة أولاً)
    -- =========================================================
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        COALESCE(v_invoice.invoice_date, CURRENT_DATE),
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
        v_invoice.invoice_number,
        'draft', v_org_id, p_invoice_id, 'invoice', false
    ) RETURNING id INTO v_journal_id;

    -- سطر 1 — مدين: حساب العميل (بصافي المستحق بعد الخصم والضريبة)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, v_customer_acc_id,
            v_invoice.total_amount, 0,
            'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, ''),
            v_org_id
        );
    END IF;

    -- سطر 2 — مدين: خصم مسموح به وعروض ترويجية
    IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, v_discount_acc_id,
            v_discount_amount, 0,
            'خصم مسموح به وعروض ترويجية - فاتورة ' || COALESCE(v_invoice.invoice_number, ''),
            v_org_id
        );
    END IF;

    -- سطر 3 — دائن: إيراد المبيعات (الإجمالي قبل الضريبة، شاملًا الخصم كبند مدين مستقل)
    IF v_sales_acc_id IS NOT NULL THEN
        IF v_discount_acc_id IS NOT NULL THEN
            v_sales_credit := COALESCE(v_invoice.subtotal, 0);
        ELSE
            v_sales_credit := GREATEST(
                COALESCE(v_invoice.subtotal, 0) - v_discount_amount,
                0
            );
        END IF;

        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, v_sales_acc_id,
            0, v_sales_credit,
            'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, ''),
            v_org_id
        );
    END IF;

    -- سطر 4 — دائن: ضريبة القيمة المضافة (المخرجات)
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, v_vat_acc_id,
            0, v_invoice.tax_amount,
            'ضريبة مخرجات مبيعات',
            v_org_id
        );
    END IF;

    -- سطران 5-6 — تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0
       AND v_cogs_acc_id      IS NOT NULL
       AND v_inventory_acc_id IS NOT NULL
    THEN
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES
            (
                v_journal_id, v_cogs_acc_id,
                v_total_cost, 0,
                'تكلفة بضاعة مباعة - فاتورة ' || COALESCE(v_invoice.invoice_number, ''),
                v_org_id
            ),
            (
                v_journal_id, v_inventory_acc_id,
                0, v_total_cost,
                'صرف مخزون لمبيعات - فاتورة ' || COALESCE(v_invoice.invoice_number, ''),
                v_org_id
            );
    END IF;

    -- صمام الموازنة الدقيقة (≤ 0.05 جنيه فرق تقريب)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_entry_diff
    FROM   public.journal_lines
    WHERE  journal_entry_id = v_journal_id;

    IF ABS(v_entry_diff) > 0 AND ABS(v_entry_diff) <= 0.05 THEN
        UPDATE public.journal_lines
        SET    debit = debit - v_entry_diff
        WHERE  journal_entry_id = v_journal_id
          AND  account_id = v_customer_acc_id;
    END IF;

    -- ترحيل القيد
    UPDATE public.journal_entries
    SET    status    = 'posted',
           is_posted = true
    WHERE  id = v_journal_id;

    -- تحديث الفاتورة للحالة 'posted'
    -- (هذا هو الـ UPDATE الوحيد الذي يُشغّل trg_auto_approve_invoice،
    --  لكن حارس allow_financial_ledger_mutation يمنع التكرار)
    UPDATE public.invoices
    SET    status                   = 'posted',
           related_journal_entry_id = v_journal_id,
           warehouse_id             = v_wh_id
    WHERE  id = p_invoice_id;

    -- تحديث رصيد العميل
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_proc
                WHERE  proname = 'update_single_customer_balance'
                  AND  pronamespace = 'public'::regnamespace
            ) THEN
                PERFORM public.update_single_customer_balance(
                    v_invoice.customer_id, v_org_id
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 🛡️ إغلاق نطاق السماح الداخلي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

-- =============================================================================
-- STEP 4: إعادة إنشاء post_sales_invoice — مجرد alias للدالة الأساسية
-- =============================================================================
CREATE OR REPLACE FUNCTION public.post_sales_invoice(
    p_invoice_id   uuid,
    p_org_id       uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.approve_invoice(p_invoice_id, p_org_id, p_warehouse_id);
END;
$$;

-- =============================================================================
-- STEP 5: صلاحيات الوصول
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_approve_invoice_on_insert()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_approve_invoice_on_items_insert() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid)   FROM anon;

-- =============================================================================
-- STEP 6: إعادة تحميل مخطط PostgREST
-- =============================================================================
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- STEP 7: التحقق من نجاح التطبيق
-- =============================================================================
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM   pg_proc p
    JOIN   pg_namespace n ON p.pronamespace = n.oid
    WHERE  n.nspname = 'public'
      AND  p.proname IN ('approve_invoice', 'post_sales_invoice');

    RAISE NOTICE '✅ الدوال المسجّلة بعد الإصلاح: % (يجب أن تكون 2)', v_count;

    IF v_count <> 2 THEN
        RAISE WARNING '⚠️ عدد الدوال غير متوقع: %. راجع السكريبت.', v_count;
    ELSE
        RAISE NOTICE '✅ تم الإصلاح بنجاح: approve_invoice(uuid,uuid,uuid) و post_sales_invoice(uuid,uuid,uuid)';
    END IF;
END $$;
