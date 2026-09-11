-- ==============================================================================
-- 🚀 إصلاح دالة ترحيل فواتير المبيعات وحل مشكلة عدم توازن قيود الموبايل وتصفير حساب المبيعات (411)
-- ==============================================================================
-- المشكلة:
-- عند إنشاء فواتير من تطبيق الموبايل، لم يكن حقل subtotal ممرراً صراحة فكان يُحفظ كـ NULL،
-- مما تسبب في أن تكون قيمة دائن حساب إيراد مبيعات بضاعة (411) فارغة أو NULL، وبالتالي أصبح القيد غير متوازن.
--
-- الحل:
-- 1. تحديث دالة approve_invoice لتقوم باحتساب v_subtotal بذكاء وأمان بديل:
--    COALESCE(subtotal, مجموع بنود الفاتورة, الإجمالي - الضريبة)
-- 2. تحديث قيمة subtotal تلقائياً في جدول invoices لمنع تكرار المشكلة مستقبلاً.
-- 3. تزويد دالة approve_invoice ببديل ذكي لحساب الخزينة (CASH) في حال السداد الفوري.
-- 4. تصحيح أي فواتير أو قيود سابقة بها خلل في حساب المبيعات (411).
-- ==============================================================================

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
    v_allow_negative_stock boolean;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_discount_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_wh_id uuid;
    v_discount_amount numeric := 0;
    v_subtotal numeric := 0;
    v_sales_credit numeric := 0;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة للفاتورة.';
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));
    v_discount_amount := COALESCE(v_invoice.discount_amount, 0);

    -- احتساب المجموع قبل الضريبة بأمان مع بدائل محكمة
    v_subtotal := COALESCE(
        NULLIF(v_invoice.subtotal, 0),
        (SELECT COALESCE(SUM(total), 0) FROM public.invoice_items WHERE invoice_id = p_invoice_id),
        (COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.tax_amount, 0)),
        0
    );

    -- تحديث subtotal في جدول الفواتير إذا كان فارغاً
    IF v_invoice.subtotal IS NULL OR v_invoice.subtotal = 0 THEN
        UPDATE public.invoices SET subtotal = v_subtotal WHERE id = p_invoice_id;
    END IF;

    -- ب. جلب الحسابات وإعدادات المخزون السالب
    SELECT account_mappings, allow_negative_stock, default_treasury_id
    INTO v_mappings, v_allow_negative_stock, v_treasury_acc_id
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    
    -- بديل ذكي لحساب الخزينة في حال السداد الفوري
    v_treasury_acc_id := COALESCE(
        v_invoice.treasury_account_id,
        v_treasury_acc_id,
        (v_mappings->>'CASH')::uuid,
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101', '101', '10101', '1101') AND is_group = false LIMIT 1)
    );

    -- حساب الخصم المسموح به وعروض التجزئة (حساب 413)
    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('413', '4102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مسموح به%' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1)
    ));

    -- إنشاء حساب 413 تلقائياً إن لم يتوفر لمنع أي عدم توازن مستقبلاً
    IF v_discount_acc_id IS NULL AND v_discount_amount > 0 THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('413', 'خصم مسموح به وعروض ترويجية', 'revenue', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_discount_acc_id;

        IF v_discount_acc_id IS NULL THEN
            SELECT id INTO v_discount_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND code = '413' LIMIT 1;
        END IF;
    END IF;

    -- ج. التحقق من المخزون والتحديث اللحظي (Delta Stock)
    FOR v_item IN 
        SELECT ii.*, p.product_type, p.stock as current_stock, p.warehouse_stock, p.base_uom_id
        FROM public.invoice_items ii 
        JOIN public.products p ON ii.product_id = p.id 
        WHERE ii.invoice_id = p_invoice_id 
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, v_item.base_uom_id);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_item.quantity;
        END IF;

        IF COALESCE(v_allow_negative_stock, false) = false AND v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                DECLARE
                    v_wh_qty numeric := COALESCE((v_item.warehouse_stock->>v_wh_id::text)::numeric, 0);
                BEGIN
                    IF v_wh_qty < v_base_qty THEN
                        RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%) في المستودع المحدد، بينما المطلوب (%).',
                            (SELECT name FROM public.products WHERE id = v_item.product_id), v_wh_qty, v_base_qty;
                    END IF;
                END;
            ELSIF COALESCE(v_item.current_stock, 0) < v_base_qty THEN
                RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%)، بينما المطلوب (%).',
                    (SELECT name FROM public.products WHERE id = v_item.product_id), v_item.current_stock, v_base_qty;
            END IF;
        END IF;

        SELECT COALESCE(cost, NULLIF(weighted_average_cost, 0), NULLIF(purchase_price, 0), 0)
        INTO v_item_cost
        FROM public.products
        WHERE id = v_item.product_id;

        v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        IF v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                UPDATE public.products
                SET 
                    stock = COALESCE(stock, 0) - v_base_qty,
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_wh_id::text],
                        to_jsonb(
                            COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty
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

    -- د. تنظيف أي قيود سابقة مرتبطة بالفاتورة
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- هـ. إنشاء قيد اليومية المزدوج المتوازن بالكامل
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
        v_invoice.invoice_number,
        'posted',
        v_org_id,
        p_invoice_id,
        'invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- 1. إثبات الجزء المحصل نقداً فوري مباشرة في حساب النقدية بالخزينة (CASH)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي بالخزينة - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 2. إثبات الجزء المتبقي آجل على ذمة العميل (فقط إن وجد متبقي غير مسدد نقداً منعاً لتحميل العميل بمبالغ محصلة)
    IF (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) > 0 AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)), 0, 'استحقاق مبيعات آجل (ذمم) - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 3. سطر مدين للخصم المسموح به وعروض المبيعات (لتوازن القيد محاسبياً)
    IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_discount_acc_id, v_discount_amount, 0, 'خصم مسموح به وعروض ترويجية - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 4. سطر دائن لإيراد المبيعات (حساب 411) - مضمون القيمة دائماً
    IF v_sales_acc_id IS NOT NULL THEN
        v_sales_credit := CASE 
            WHEN v_discount_acc_id IS NOT NULL THEN v_subtotal 
            ELSE (v_subtotal - v_discount_amount) 
        END;
        IF v_sales_credit <= 0 THEN
            v_sales_credit := COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.tax_amount, 0);
        END IF;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_sales_credit, 'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 5. سطر دائن لضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- 6. سطر تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة
    UPDATE public.invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id,
        treasury_account_id = COALESCE(v_invoice.treasury_account_id, v_treasury_acc_id)
    WHERE id = p_invoice_id;

    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

-- 🛠️ اسم مستعار متوافق مع كافة واجهات المبيعات
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

-- التأكد من الصلاحيات
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO anon;

-- إصلاح شامل لأي فواتير سابقة بها نقص في subtotal
UPDATE public.invoices
SET subtotal = COALESCE(
    (SELECT SUM(total) FROM public.invoice_items WHERE invoice_items.invoice_id = invoices.id),
    total_amount - COALESCE(tax_amount, 0)
)
WHERE subtotal IS NULL OR subtotal = 0;

-- إصلاح أسطر حساب إيراد مبيعات بضاعة (411) في القيود التي كانت قيمتها NULL
UPDATE public.journal_lines jl
SET credit = COALESCE(inv.subtotal, inv.total_amount - COALESCE(inv.tax_amount, 0), 0)
FROM public.journal_entries je
JOIN public.invoices inv ON je.related_document_id = inv.id AND je.related_document_type = 'invoice'
JOIN public.accounts acc ON jl.account_id = acc.id
WHERE jl.journal_entry_id = je.id
  AND acc.code = '411'
  AND (jl.credit IS NULL OR jl.credit = 0);

-- إصلاح أسطر الفواتير النقدية التي سجلت خطأ في حساب العملاء (1221) بدلاً من الخزينة/الصندوق (1231)
UPDATE public.journal_lines jl
SET account_id = COALESCE(
    inv.treasury_account_id,
    (SELECT id FROM public.accounts WHERE organization_id = je.organization_id AND code IN ('1231', '123101', '101') AND is_group = false LIMIT 1)
),
description = 'تحصيل نقدي بالخزينة - فاتورة مبيعات رقم ' || COALESCE(inv.invoice_number, '-')
FROM public.journal_entries je
JOIN public.invoices inv ON je.related_document_id = inv.id AND je.related_document_type = 'invoice'
JOIN public.accounts acc ON jl.account_id = acc.id
WHERE jl.journal_entry_id = je.id
  AND acc.code = '1221'
  AND (inv.status = 'paid' OR inv.paid_amount >= inv.total_amount)
  AND jl.debit > 0;

