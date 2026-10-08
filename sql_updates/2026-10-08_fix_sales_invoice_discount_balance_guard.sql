-- =============================================================================
-- ملف هجرة قاعدة البيانات | Database Migration File
-- =============================================================================
-- الملف   : 2026-10-08_fix_sales_invoice_discount_balance_guard.sql
-- التاريخ : 2026-10-08
-- الأولوية: حرجة جداً (CRITICAL FIX)
-- المشروع : TriPro-ERP
-- -----------------------------------------------------------------------------
-- المشكلة (Root Cause Analysis):
-- 1. عند ترحيل فواتير مبيعات تحتوي على خصم (Discount / Promotions)، مثل فواتير شركة لينزا:
--    كانت دالة approve_invoice تسجل حساب العملاء (مدين) بصافي المبلغ (total_amount)،
--    وتسجل إيراد المبيعات (دائن) بإجمالي البنود قبل الخصم (subtotal)، دون إنشاء سطر مدين
--    لحساب الخصم المسموح به (413) ودون موازنة الفارق.
-- 2. ترتب على ذلك عدم توازن القيد اليومي بقيمة الخصم، مما أدى لإطلاق صمام أمان توازن القيود:
--    (trg_guard_journal_lines_balance) بخطأ:
--    "⚠️ صمام أمان توازن القيود: عملية التعديل أو الحذف تجعل القيد المرحل (INV-XXXXXX) غير متوازن!"
-- 3. وجود خطأ في دالة fn_enforce_journal_balance_on_post حيث كانت تشير إلى عمود reference_number
--    غير الموجود في جدول journal_entries (العمود الصحيح هو reference).
-- 4. إغلاق القيد كـ posted قبل إدراج وتوازن أسطره تسبب في تعارض مع fn_protect_posted_journal_lines.
--
-- الإصلاحات (What this migration fixes):
-- 1. تصحيح دالة fn_enforce_journal_balance_on_post لاستخدام NEW.reference بأمان.
-- 2. تحديث دالة approve_invoice لإثبات الخصم المسموح به (حساب 413) في الطرف المدين.
-- 3. إنشاء القيد اليومي بحالة مسودة (draft) أولاً، ثم إدراج أسطره وموازنتها بدقة،
--    ثم ترحيل القيد (posted) لضمان تفعيل الحراس بدون تعارض.
-- 4. إضافة صمام موازنة تلقائي لفروق الكسور والتقريب (Auto-Balancing Safety Valve).
-- =============================================================================

-- =============================================================================
-- 1. تصحيح دالة حارس توازن القيد اليومي (fn_enforce_journal_balance_on_post)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_balance_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_debit   NUMERIC(20, 6) := 0;
    v_total_credit  NUMERIC(20, 6) := 0;
    v_difference    NUMERIC(20, 6) := 0;
    v_negative_cnt  INTEGER        := 0;
    v_ref_number    TEXT;
BEGIN
    -- فحص الانتقال إلى حالة posted
    IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN

        -- استخدام حقل reference الصحيح (أو id في حال عدم وجوده)
        v_ref_number := COALESCE(NEW.reference, NEW.id::TEXT, 'UNKNOWN');

        -- فحص الأرقام السالبة في بنود القيد
        SELECT COUNT(*)
        INTO v_negative_cnt
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id
          AND (debit < 0 OR credit < 0);

        IF v_negative_cnt > 0 THEN
            RAISE EXCEPTION
                'NEGATIVE_AMOUNT_IN_JOURNAL_LINE: القيد [%] يحتوي على مبالغ سالبة في % سطر/سطور.',
                v_ref_number, v_negative_cnt;
        END IF;

        -- حساب مجموع المدين والدائن
        SELECT
            COALESCE(SUM(debit),  0),
            COALESCE(SUM(credit), 0)
        INTO
            v_total_debit,
            v_total_credit
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        v_difference := ABS(v_total_debit - v_total_credit);

        -- حد التسامح المحاسبي الدقيق
        IF v_difference > 0.05 THEN
            RAISE EXCEPTION
                'JOURNAL_IMBALANCED: القيد غير متوازن — المرجع: [%] | المدين: % | الدائن: % | الفرق: %.',
                v_ref_number, v_total_debit, v_total_credit, v_difference;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. تحديث دالة ترحيل فواتير المبيعات الشاملة (approve_invoice)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
    v_item_cost numeric;
    v_total_cost numeric := 0;
    v_mappings jsonb;
    v_allow_negative_stock boolean := false;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_discount_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_wh_id uuid;
    v_locked_stock numeric;
    v_locked_wh_stock jsonb;
    v_has_user_perm boolean := false;
    v_discount_amount numeric := 0;
    v_sales_credit numeric := 0;
    v_entry_diff numeric := 0;
BEGIN
    -- أ. التحقق من وجود الفاتورة وحالتها
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN; -- الفاتورة مرحلة مسبقاً
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة للفاتورة.';
    END IF;

    v_wh_id := COALESCE(
        p_warehouse_id,
        v_invoice.warehouse_id,
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id ORDER BY created_at LIMIT 1)
    );

    -- ب. جلب إعدادات الشركة: allow_negative_stock من company_settings
    SELECT
        account_mappings,
        COALESCE(allow_negative_stock, false)
    INTO v_mappings, v_allow_negative_stock
    FROM public.company_settings
    WHERE organization_id = v_org_id
    LIMIT 1;

    -- فحص صلاحية البيع بالسالب على مستوى المستخدم إن وجدت
    IF NOT v_allow_negative_stock AND v_invoice.created_by IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'user_permissions'
            ) THEN
                SELECT EXISTS (
                    SELECT 1 FROM public.user_permissions up
                    JOIN public.permissions p ON up.permission_id = p.id
                    WHERE up.user_id = v_invoice.created_by
                      AND up.granted = true
                      AND p.module IN ('sales', 'inventory')
                      AND p.action = 'negative_stock'
                ) INTO v_has_user_perm;

                IF v_has_user_perm THEN
                    v_allow_negative_stock := true;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- ج. جلب معرّفات الحسابات من الربط المحاسبي
    v_sales_acc_id     := COALESCE((v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('411','4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id       := COALESCE((v_mappings->>'VAT')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('2231','2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id  := COALESCE((v_mappings->>'CUSTOMERS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('1221','1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id      := COALESCE((v_mappings->>'COGS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('511','5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id       := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('10302','1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id  := v_invoice.treasury_account_id;

    -- جلب أو إنشاء حساب الخصم المسموح به وعروض المبيعات (حساب 413)
    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('413', '4102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مسموح به%' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1)
    ));

    IF v_discount_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('413', 'خصم مسموح به وعروض ترويجية', 'revenue', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_discount_acc_id;

        IF v_discount_acc_id IS NULL THEN
            SELECT id INTO v_discount_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND code = '413' LIMIT 1;
        END IF;
    END IF;

    -- حساب الخصم الفعلي بدقة لضمان توازن القيد مع الصافي والإجمالي
    v_discount_amount := GREATEST(
        (COALESCE(v_invoice.subtotal, 0) + COALESCE(v_invoice.tax_amount, 0)) - COALESCE(v_invoice.total_amount, 0),
        COALESCE(v_invoice.discount_amount, 0),
        COALESCE(v_invoice.promo_discount, 0),
        0
    );

    -- د. حلقة فحص وخصم المخزون مع القفل المتشائم الصارم
    FOR v_item IN
        SELECT ii.*, p.product_type, p.base_uom_id
        FROM public.invoice_items ii
        JOIN public.products p ON ii.product_id = p.id
        WHERE ii.invoice_id = p_invoice_id
    LOOP
        SELECT stock, warehouse_stock
        INTO v_locked_stock, v_locked_wh_stock
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, v_item.base_uom_id);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF COALESCE(v_base_qty, 0) <= 0 THEN
            v_base_qty := GREATEST(v_item.quantity, 0);
        END IF;

        IF NOT v_allow_negative_stock AND v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                IF COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0) < v_base_qty THEN
                    RAISE EXCEPTION
                        '❌ [عجز مخزون]: الصنف "%" رصيده (%) في المستودع، والمطلوب (%)',
                        (SELECT name FROM public.products WHERE id = v_item.product_id),
                        COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0),
                        v_base_qty;
                END IF;
            ELSIF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                RAISE EXCEPTION
                    '❌ [عجز مخزون]: الصنف "%" رصيده العام (%)، والمطلوب (%)',
                    (SELECT name FROM public.products WHERE id = v_item.product_id),
                    v_locked_stock, v_base_qty;
            END IF;
        END IF;

        SELECT COALESCE(cost, NULLIF(weighted_average_cost, 0), NULLIF(purchase_price, 0), 0)
        INTO v_item_cost
        FROM public.products WHERE id = v_item.product_id;

        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_base_qty);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        IF v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                UPDATE public.products
                SET
                    stock = COALESCE(stock, 0) - v_base_qty,
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_wh_id::text],
                        to_jsonb(COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty)
                    )
                WHERE id = v_item.product_id;
            ELSE
                UPDATE public.products
                SET stock = COALESCE(stock, 0) - v_base_qty
                WHERE id = v_item.product_id;
            END IF;
        END IF;
    END LOOP;

    -- هـ. حذف أي قيود سابقة مرتبطة بالفاتورة
    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice'
    );
    DELETE FROM public.journal_entries
    WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- و. إنشاء القيد أولاً بحالة مسودة (draft) لتسهيل إدراج الأسطر وموازنتها بدقة
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
        v_invoice.invoice_number,
        'draft', v_org_id, p_invoice_id, 'invoice', false
    ) RETURNING id INTO v_journal_id;

    -- 1. سطر مدين: حساب العميل بصافي المستحق
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0,
                'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 2. سطر مدين: الخصم المسموح به وعروض المبيعات (حساب 413)
    IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_discount_acc_id, v_discount_amount, 0,
                'خصم مسموح به وعروض ترويجية - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 3. سطر دائن: إيراد المبيعات
    IF v_sales_acc_id IS NOT NULL THEN
        IF v_discount_acc_id IS NOT NULL THEN
            v_sales_credit := COALESCE(v_invoice.subtotal, 0);
        ELSE
            v_sales_credit := GREATEST(COALESCE(v_invoice.subtotal, 0) - v_discount_amount, 0);
        END IF;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_sales_credit,
                'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 4. سطر دائن: ضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- 5. سطران: تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- 6. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0
       AND v_treasury_acc_id IS NOT NULL
       AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0,
             'تحصيل نقدي - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount,
             'سداد فوري من العميل - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 🛡️ 7. صمام الموازنة الذاتي التلقائي لفروق الكسور العشرية (Auto-Balancing Safety Valve)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_entry_diff
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id;

    IF ABS(v_entry_diff) > 0 AND ABS(v_entry_diff) <= 0.05 THEN
        IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
            UPDATE public.journal_lines
            SET debit = debit - v_entry_diff
            WHERE journal_entry_id = v_journal_id AND account_id = v_discount_acc_id;
        ELSE
            UPDATE public.journal_lines
            SET credit = credit + v_entry_diff
            WHERE journal_entry_id = v_journal_id AND account_id = v_sales_acc_id;
        END IF;
    END IF;

    -- 🔒 اعتماد وترحيل القيد اليومي الآن بعد التوازن التام 100%
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_journal_id;

    -- ز. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices
    SET
        status = CASE
            WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid'
            ELSE 'posted'
        END,
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد العميل
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance'
                       AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

-- =============================================================================
-- 3. دالة post_sales_invoice المستعارة المتوافقة مع كافة الواجهات
-- =============================================================================
CREATE OR REPLACE FUNCTION public.post_sales_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
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
-- 4. ضبط الصلاحيات (Permissions Hardening)
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) FROM anon, public;

DO $$ BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '✅ تم تثبيت إصلاح توازن قيود فواتير المبيعات بنجاح تام!';
    RAISE NOTICE '   - fn_enforce_journal_balance_on_post تم تصحيح مرجعها.';
    RAISE NOTICE '   - approve_invoice تدعم الخصومات المسموحة وموازنة القيود التلقائية.';
    RAISE NOTICE '   - post_sales_invoice جاهزة ومحدثة.';
    RAISE NOTICE '=================================================================';
END $$;
