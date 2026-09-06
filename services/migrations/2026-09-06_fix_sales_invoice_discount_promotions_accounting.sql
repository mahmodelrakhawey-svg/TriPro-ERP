-- ========================================================================================
-- TriPro ERP — Fix Sales & Purchase Invoice Discounts & Promotions Accounting
-- Date: 2026-09-06
-- الغرض:
-- 1. إضافة عمود promo_discount لجدول الفواتير invoices
-- 2. تحديث دالة save_sales_invoice_draft لتخزين promo_discount
-- 3. تحديث دالة approve_invoice (ترحيل فواتير المبيعات) لإثبات الخصم المسموح به وعروض المبيعات
--    (حساب 413) في الطرف المدين لضمان توازن القيد 100% وفقاً لمعايير GAAP والمحاسبة المصرية
-- 4. تحديث دالة approve_purchase_invoice لإثبات الخصم المكتسب (حساب 513) في الطرف الدائن
-- 5. تصحيح وموازنة القيود السابقة غير المتوازنة لفواتير المبيعات (مثل INV-986080)
-- ========================================================================================

-- 1. إضافة عمود خصم العروض الترويجية
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS promo_discount numeric DEFAULT 0;

-- 2. تحديث دالة الحفظ الذري للمسودات لدعم promo_discount
CREATE OR REPLACE FUNCTION public.save_sales_invoice_draft(
    p_invoice jsonb,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id uuid;
    v_org_id uuid;
    v_item jsonb;
    v_saved_invoice record;
BEGIN
    IF p_invoice ? 'id' AND NULLIF(p_invoice->>'id', '') IS NOT NULL THEN
        v_invoice_id := (p_invoice->>'id')::uuid;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    v_org_id := (p_invoice->>'organization_id')::uuid;
    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices WHERE id = v_invoice_id) THEN
        UPDATE public.invoices
        SET
            organization_id = v_org_id,
            invoice_number = COALESCE(p_invoice->>'invoice_number', invoice_number),
            customer_id = (p_invoice->>'customer_id')::uuid,
            warehouse_id = (p_invoice->>'warehouse_id')::uuid,
            salesperson_id = NULLIF(p_invoice->>'salesperson_id', '')::uuid,
            invoice_date = (p_invoice->>'invoice_date')::date,
            total_amount = (p_invoice->>'total_amount')::numeric,
            tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            subtotal = COALESCE((p_invoice->>'subtotal')::numeric, 0),
            discount_amount = COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            promo_discount = COALESCE((p_invoice->>'promo_discount')::numeric, 0),
            paid_amount = COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            treasury_account_id = NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            notes = p_invoice->>'notes',
            status = COALESCE(p_invoice->>'status', 'draft'),
            currency = COALESCE(p_invoice->>'currency', 'EGP'),
            exchange_rate = COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            cost_center_id = NULLIF(p_invoice->>'cost_center_id', '')::uuid,
            updated_at = NOW()
        WHERE id = v_invoice_id;
    ELSE
        INSERT INTO public.invoices (
            id,
            organization_id,
            invoice_number,
            customer_id,
            warehouse_id,
            salesperson_id,
            invoice_date,
            total_amount,
            tax_amount,
            subtotal,
            discount_amount,
            promo_discount,
            paid_amount,
            treasury_account_id,
            notes,
            status,
            currency,
            exchange_rate,
            cost_center_id,
            created_by,
            created_at,
            updated_at
        ) VALUES (
            v_invoice_id,
            v_org_id,
            p_invoice->>'invoice_number',
            (p_invoice->>'customer_id')::uuid,
            (p_invoice->>'warehouse_id')::uuid,
            NULLIF(p_invoice->>'salesperson_id', '')::uuid,
            COALESCE((p_invoice->>'invoice_date')::date, CURRENT_DATE),
            (p_invoice->>'total_amount')::numeric,
            COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            COALESCE((p_invoice->>'subtotal')::numeric, 0),
            COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            COALESCE((p_invoice->>'promo_discount')::numeric, 0),
            COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            p_invoice->>'notes',
            COALESCE(p_invoice->>'status', 'draft'),
            COALESCE(p_invoice->>'currency', 'EGP'),
            COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            NULLIF(p_invoice->>'cost_center_id', '')::uuid,
            NULLIF(p_invoice->>'created_by', '')::uuid,
            NOW(),
            NOW()
        );
    END IF;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
        DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            INSERT INTO public.invoice_items (
                organization_id,
                invoice_id,
                product_id,
                quantity,
                unit_price,
                uom_id,
                total,
                cost
            ) VALUES (
                v_org_id,
                v_invoice_id,
                (v_item->>'product_id')::uuid,
                (v_item->>'quantity')::numeric,
                (v_item->>'unit_price')::numeric,
                NULLIF(v_item->>'uom_id', '')::uuid,
                (v_item->>'total')::numeric,
                COALESCE((v_item->>'cost')::numeric, 0)
            );
        END LOOP;
    END IF;

    SELECT * INTO v_saved_invoice FROM public.invoices WHERE id = v_invoice_id;
    RETURN to_jsonb(v_saved_invoice);
END;
$$;

-- 3. تحديث دالة ترحيل فواتير المبيعات (approve_invoice) لدعم توازن الخصم المسموح به وعروض الهايبر ماركت
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

    -- ب. جلب الحسابات وإعدادات المخزون السالب
    SELECT account_mappings, allow_negative_stock 
    INTO v_mappings, v_allow_negative_stock 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

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

    -- 1. سطر مدين للعميل بإجمالي الفاتورة الصافي
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 2. سطر مدين للخصم المسموح به وعروض المبيعات (لتوازن القيد محاسبياً)
    IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_discount_acc_id, v_discount_amount, 0, 'خصم مسموح به وعروض ترويجية - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- 3. سطر دائن لإيراد المبيعات
    IF v_sales_acc_id IS NOT NULL THEN
        DECLARE
            v_sales_credit numeric := CASE 
                WHEN v_discount_acc_id IS NOT NULL THEN v_invoice.subtotal 
                ELSE (v_invoice.subtotal - v_discount_amount) 
            END;
        BEGIN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_sales_acc_id, 0, v_sales_credit, 'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
        END;
    END IF;

    -- 4. سطر دائن لضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- 5. سطر تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- 6. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة
    UPDATE public.invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
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

-- اسم مستعار لدالة المبيعات (post_sales_invoice)
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

-- 4. تحديث دالة ترحيل فواتير المشتريات (approve_purchase_invoice) لدعم توازن الخصم المكتسب
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
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
    v_item record;
    v_org_id uuid;
    v_wh_id uuid;
    v_base_qty numeric;
    v_unit_cost_base numeric;
    v_inventory_acc_id uuid;
    v_vat_in_id uuid;
    v_supplier_acc_id uuid;
    v_purchase_discount_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb;
    v_cur_stock numeric;
    v_cur_cost numeric;
    v_new_wac numeric;
    v_discount_amount numeric := 0;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));
    v_discount_amount := COALESCE(v_invoice.discount_amount, 0);

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10301', '1105') AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1241', '2103') AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2101') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- حساب الخصم المكتسب (حساب 513 أو 5102)
    v_purchase_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'PURCHASE_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'PURCHASE_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('513', '5102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مكتسب%' LIMIT 1)
    ));

    IF v_purchase_discount_acc_id IS NULL AND v_discount_amount > 0 THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('513', 'خصم مكتسب على المشتريات', 'cogs', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_purchase_discount_acc_id;

        IF v_purchase_discount_acc_id IS NULL THEN
            SELECT id INTO v_purchase_discount_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND code = '513' LIMIT 1;
        END IF;
    END IF;

    FOR v_item IN 
        SELECT pii.*, p.stock as prod_stock, p.weighted_average_cost, p.cost, p.purchase_price, p.base_uom_id
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
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

        v_unit_cost_base := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        v_cur_stock := COALESCE(v_item.prod_stock, 0);
        v_cur_cost := COALESCE(NULLIF(v_item.weighted_average_cost, 0), NULLIF(v_item.cost, 0), v_item.purchase_price, v_unit_cost_base);

        IF (v_cur_stock + v_base_qty) > 0 THEN
            v_new_wac := ROUND(((v_cur_stock * v_cur_cost) + (v_base_qty * v_unit_cost_base)) / (v_cur_stock + v_base_qty), 4);
        ELSE
            v_new_wac := v_unit_cost_base;
        END IF;

        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) + v_base_qty
                    )
                ),
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
        v_invoice.invoice_number,
        'posted',
        v_org_id,
        p_invoice_id,
        'purchase_invoice',
        true
    ) RETURNING id INTO v_journal_id;

    IF v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END IF;

    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- سطر دائن للخصم المكتسب لتوازن القيد
    IF v_discount_amount > 0 AND v_purchase_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_discount_amount, 'خصم مكتسب على المشتريات', v_org_id);
    END IF;

    IF v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق مورد - فاتورة مشتريات', v_org_id);
    END IF;

    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL AND v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_invoice.paid_amount, 'دفع نقدي للمورد', v_org_id);
    END IF;

    UPDATE public.purchase_invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    IF v_invoice.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

-- 5. تصحيح وموازنة القيود السابقة غير المتوازنة الناتجة عن فواتير مبيعات بها خصومات (بما فيها INV-986080)
DO $$
DECLARE
    r RECORD;
    v_disc_acc uuid;
    v_diff numeric;
BEGIN
    FOR r IN (
        SELECT 
            i.id as invoice_id,
            i.organization_id,
            i.invoice_number,
            i.discount_amount,
            i.related_journal_entry_id,
            COALESCE(SUM(jl.debit), 0) as total_debit,
            COALESCE(SUM(jl.credit), 0) as total_credit
        FROM public.invoices i
        JOIN public.journal_lines jl ON jl.journal_entry_id = i.related_journal_entry_id
        WHERE i.status IN ('posted', 'paid')
          AND COALESCE(i.discount_amount, 0) > 0
        GROUP BY i.id, i.organization_id, i.invoice_number, i.discount_amount, i.related_journal_entry_id
        HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
    ) LOOP
        v_diff := r.total_credit - r.total_debit;

        -- التحقق من أن الفرق يطابق قيمة الخصم المفقودة في الجانب المدين
        IF v_diff > 0 AND ABS(v_diff - r.discount_amount) < 0.02 THEN
            -- جلب أو إنشاء حساب الخصم المسموح به للمنظمة
            SELECT id INTO v_disc_acc FROM public.accounts 
            WHERE organization_id = r.organization_id AND code IN ('413', '4102') AND is_group = false LIMIT 1;
            
            IF v_disc_acc IS NULL THEN
                INSERT INTO public.accounts (code, name, type, is_group, organization_id)
                VALUES ('413', 'خصم مسموح به وعروض ترويجية', 'revenue', false, r.organization_id)
                ON CONFLICT DO NOTHING
                RETURNING id INTO v_disc_acc;
                
                IF v_disc_acc IS NULL THEN
                    SELECT id INTO v_disc_acc FROM public.accounts 
                    WHERE organization_id = r.organization_id AND code = '413' LIMIT 1;
                END IF;
            END IF;

            -- إدراج سطر الخصم المدين لتصحيح وموازنة القيد فوراً
            IF v_disc_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (r.related_journal_entry_id, v_disc_acc, r.discount_amount, 0, 'خصم مسموح به وعروض ترويجية - فاتورة رقم ' || COALESCE(r.invoice_number, '-'), r.organization_id);
            END IF;
        END IF;
    END LOOP;
END $$;

-- منح الصلاحيات للأدوار المصادقة وغير المصادقة
GRANT EXECUTE ON FUNCTION public.save_sales_invoice_draft(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_invoice_draft(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO anon;
