-- =====================================================================
-- 🛡️ TriPro-ERP: السماح بالبيع بالسالب لشركة لينزا والمستخدمين المصرح لهم
-- التاريخ: 2026-10-03
-- النطاق:
--   1. تحديث إعدادات شركة لينزا في company_settings لتفعيل allow_negative_stock = true
--   2. تحديث دالة approve_invoice لاستثناء شركة لينزا والمستخدمين الحاصلين على صلاحية negative_stock
-- =====================================================================

-- 1. تحديث سجل إعدادات شركة لينزا تلقائياً في قاعدة البيانات
UPDATE public.company_settings cs
SET allow_negative_stock = true
WHERE cs.company_name ILIKE '%لينزا%' 
   OR cs.company_name ILIKE '%lenza%'
   OR cs.organization_id IN (
       SELECT id FROM public.organizations 
       WHERE name ILIKE '%لينزا%' OR name ILIKE '%lenza%'
   );

-- 2. تحديث دالة ترحيل فواتير المبيعات لدعم استثناء شركة لينزا وصلاحيات المستخدمين
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
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_wh_id uuid;
    v_locked_stock numeric;
    v_locked_wh_stock jsonb;
    v_has_user_perm boolean := false;
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

    -- ب. جلب الحسابات وإعدادات المخزون السالب
    SELECT account_mappings, allow_negative_stock 
    INTO v_mappings, v_allow_negative_stock 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;

    -- 🛡️ استثناء شركة لينزا (Lenza): السماح الدائم بالبيع بالسالب
    IF (v_mappings->>'company_name' ILIKE '%لينزا%' OR v_mappings->>'company_name' ILIKE '%lenza%')
       OR EXISTS (
           SELECT 1 FROM public.company_settings 
           WHERE organization_id = v_org_id 
             AND (company_name ILIKE '%لينزا%' OR company_name ILIKE '%lenza%')
       )
       OR EXISTS (
           SELECT 1 FROM public.organizations 
           WHERE id = v_org_id 
             AND (name ILIKE '%لينزا%' OR name ILIKE '%lenza%')
       ) THEN
        v_allow_negative_stock := true;
    END IF;

    -- 🛡️ فحص صلاحيات المستخدم منشئ الفاتورة للبيع بالسالب
    IF COALESCE(v_allow_negative_stock, false) = false AND v_invoice.created_by IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'user_permissions'
            ) THEN
                EXECUTE 'SELECT EXISTS (
                    SELECT 1 FROM public.user_permissions up
                    JOIN public.permissions p ON up.permission_id = p.id
                    WHERE up.user_id = $1
                      AND up.granted = true
                      AND ((p.module = ''sales'' AND p.action = ''negative_stock'') OR (p.module = ''inventory'' AND p.action = ''negative_stock''))
                )' INTO v_has_user_perm USING v_invoice.created_by;
                
                IF v_has_user_perm THEN
                    v_allow_negative_stock := true;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- ج. التحقق من المخزون والتحديث اللحظي مع القفل المتشائم
    FOR v_item IN 
        SELECT ii.*, p.product_type, p.base_uom_id
        FROM public.invoice_items ii 
        JOIN public.products p ON ii.product_id = p.id 
        WHERE ii.invoice_id = p_invoice_id 
    LOOP
        -- 🔒 القفل المتشائم الصارم لسجل الصنف (Pessimistic Row Lock) لمنع أي تضارب متزامن
        SELECT stock, warehouse_stock 
        INTO v_locked_stock, v_locked_wh_stock
        FROM public.products 
        WHERE id = v_item.product_id 
        FOR UPDATE;

        -- حساب الكمية بالوحدة الأساسية
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

        -- فحص المخزون السالب الصارم (يتم تجاوزه عند تفعيل v_allow_negative_stock)
        IF COALESCE(v_allow_negative_stock, false) = false AND v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                DECLARE
                    v_wh_qty numeric := COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0);
                BEGIN
                    IF v_wh_qty < v_base_qty THEN
                        RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%) في المستودع المحدد، بينما المطلوب (%).',
                            (SELECT name FROM public.products WHERE id = v_item.product_id), v_wh_qty, v_base_qty;
                    END IF;
                END;
            ELSIF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%)، بينما المطلوب (%).',
                    (SELECT name FROM public.products WHERE id = v_item.product_id), v_locked_stock, v_base_qty;
            END IF;
        END IF;

        -- حساب التكلفة
        SELECT COALESCE(cost, NULLIF(weighted_average_cost, 0), NULLIF(purchase_price, 0), 0)
        INTO v_item_cost
        FROM public.products
        WHERE id = v_item.product_id;

        v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- خصم المخزون اللحظي (Delta Direct Update تحت القفل حتى مع الرصيد السالب)
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

    -- د. تنظيف أي قيود سابقة مرتبطة بالفاتورة منعاً للتكرار
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- هـ. إنشاء قيد اليومية المزدوج
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

    -- سطر مدين للعميل بإجمالي الفاتورة
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- سطر دائن لإيراد المبيعات بالصافي
    IF v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- سطر دائن لضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- سطر تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد العميل الفردي
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

GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO anon;
