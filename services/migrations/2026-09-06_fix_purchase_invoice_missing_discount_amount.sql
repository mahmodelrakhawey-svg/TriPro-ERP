-- ========================================================================================
-- TriPro ERP — Fix Missing discount_amount in purchase_invoices & Fix post_purchase_invoice
-- Date: 2026-09-06
-- الغرض:
-- حل خطأ 42703 (record "v_invoice" has no field "discount_amount") عند ترحيل فواتير المشتريات
-- الناتج عن تحديث دالة approve_purchase_invoice بدون إضافة عمود discount_amount لجدول purchase_invoices
-- ========================================================================================

-- 1. إضافة عمود discount_amount لجدول فواتير المشتريات public.purchase_invoices
ALTER TABLE public.purchase_invoices 
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- 2. التأكد من وجود عمود unit_price في purchase_invoice_items
ALTER TABLE public.purchase_invoice_items 
ADD COLUMN IF NOT EXISTS unit_price numeric(19,4) DEFAULT 0;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items' AND column_name = 'price') THEN
        UPDATE public.purchase_invoice_items 
        SET unit_price = price 
        WHERE (unit_price IS NULL OR unit_price = 0) AND price IS NOT NULL AND price > 0;
    END IF;
END $$;

-- 3. تحديث دالة اعتماد وترحيل فاتورة المشتريات (approve_purchase_invoice) بطريقة آمنة تماماً
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
    v_subtotal numeric := 0;
    v_tax_amount numeric := 0;
    v_total_amount numeric := 0;
    v_paid_amount numeric := 0;
BEGIN
    -- أ. جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- إذا كانت مرحلة بالفعل نخرج دون تكرار القيد
    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة لفاتورة المشتريات.';
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));
    
    -- قراءة الحقول المالية بأمان تام (لتجنب أي استثناء إذا كان الحقل غير معرّف في نوع السجل)
    v_discount_amount := COALESCE((to_jsonb(v_invoice)->>'discount_amount')::numeric, 0);
    v_total_amount := COALESCE(v_invoice.total_amount, 0);
    v_tax_amount := COALESCE(v_invoice.tax_amount, 0);
    v_paid_amount := COALESCE(v_invoice.paid_amount, 0);
    v_subtotal := COALESCE(v_invoice.subtotal, (v_total_amount - v_tax_amount + v_discount_amount));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- ب. جلب الحسابات المحاسبية
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10301', '103', '1105') AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1241', '10204', '202', '2103') AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2101') AND organization_id = v_org_id LIMIT 1));

    -- ج. جلب أو إنشاء حساب الخصم المكتسب (حساب 513 أو 5102)
    IF v_discount_amount > 0 THEN
        v_purchase_discount_acc_id := public.resolve_leaf_account(COALESCE(
            public.safe_cast_uuid(v_mappings->>'PURCHASE_DISCOUNT'),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'PURCHASE_DISCOUNT') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('513', '5102') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مكتسب%' LIMIT 1)
        ));

        IF v_purchase_discount_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, is_group, organization_id)
            VALUES ('513', 'خصم مكتسب على المشتريات', 'cogs', false, v_org_id)
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_purchase_discount_acc_id;

            IF v_purchase_discount_acc_id IS NULL THEN
                SELECT id INTO v_purchase_discount_acc_id FROM public.accounts 
                WHERE organization_id = v_org_id AND code = '513' LIMIT 1;
            END IF;
        END IF;
    END IF;

    -- د. تحديث المخزون ومتوسط التكلفة المرجح (WAC) لكل صنف
    FOR v_item IN 
        SELECT pii.*, p.stock as prod_stock, p.weighted_average_cost, p.cost, p.purchase_price, p.base_uom_id, p.inventory_account_id
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

        -- قراءة السعر بأمان من unit_price أو price
        DECLARE
            v_raw_price numeric := COALESCE(
                (to_jsonb(v_item)->>'unit_price')::numeric,
                (to_jsonb(v_item)->>'price')::numeric,
                0
            );
        BEGIN
            v_unit_cost_base := (v_raw_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        END;

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

    -- هـ. مسح القيود القديمة للفاتورة إن وجدت
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- و. إنشاء قيد اليومية المتوازن لفاتورة المشتريات
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

    -- 1. الطرف المدين: المخزون بإجمالي البنود (Subtotal)
    IF v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_subtotal, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END IF;

    -- 2. الطرف المدين: ضريبة المدخلات (إن وجدت)
    IF v_tax_amount > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- 3. الطرف الدائن: الخصم المكتسب (إن وجد) لتوازن القيد بدقة
    IF v_discount_amount > 0 AND v_purchase_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_discount_amount, 'خصم مكتسب على المشتريات', v_org_id);
    END IF;

    -- 4. الطرف الدائن: استحقاق المورد بصافي الفاتورة (Total Amount)
    IF v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount, 'استحقاق مورد - فاتورة مشتريات', v_org_id);
    END IF;

    -- 5. إثبات السداد الفوري (إن وجد)
    IF v_paid_amount > 0 AND v_treasury_acc_id IS NOT NULL AND v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_paid_amount, 0, 'سداد فوري - فاتورة مشتريات ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_paid_amount, 'دفع نقدي للمورد', v_org_id);
    END IF;

    -- ز. تحديث حالة الفاتورة وربطها برقم القيد المحاسبي
    UPDATE public.purchase_invoices 
    SET status = CASE WHEN (v_total_amount - v_paid_amount) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- ح. تحديث رصيد المورد لحظياً
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

-- 4. التأكد من وجود الاسم المستعار post_purchase_invoice ليتطابق مع استدعاء الواجهة الأمامية
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(
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
    PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id);
END;
$$;

-- 5. تحديث دالة save_purchase_invoice_draft لتخزين discount_amount أيضاً
CREATE OR REPLACE FUNCTION public.save_purchase_invoice_draft(
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
    v_invoice_id := NULLIF(p_invoice->>'id', '')::uuid;
    IF v_invoice_id IS NULL THEN
        v_invoice_id := gen_random_uuid();
    END IF;

    v_org_id := NULLIF(p_invoice->>'organization_id', '')::uuid;
    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = v_invoice_id AND status = 'posted') THEN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'unpost_purchase_invoice' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.unpost_purchase_invoice(v_invoice_id, v_org_id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = v_invoice_id) THEN
        UPDATE public.purchase_invoices
        SET
            organization_id = v_org_id,
            invoice_number = COALESCE(p_invoice->>'invoice_number', invoice_number),
            supplier_id = (p_invoice->>'supplier_id')::uuid,
            warehouse_id = (p_invoice->>'warehouse_id')::uuid,
            invoice_date = (p_invoice->>'invoice_date')::date,
            total_amount = (p_invoice->>'total_amount')::numeric,
            tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            subtotal = COALESCE((p_invoice->>'subtotal')::numeric, 0),
            discount_amount = COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            paid_amount = COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            treasury_account_id = NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            notes = p_invoice->>'notes',
            status = 'draft',
            currency = COALESCE(p_invoice->>'currency', 'EGP'),
            exchange_rate = COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            related_journal_entry_id = NULL
        WHERE id = v_invoice_id;
    ELSE
        INSERT INTO public.purchase_invoices (
            id,
            organization_id,
            invoice_number,
            supplier_id,
            warehouse_id,
            invoice_date,
            total_amount,
            tax_amount,
            subtotal,
            discount_amount,
            paid_amount,
            treasury_account_id,
            notes,
            status,
            currency,
            exchange_rate,
            created_at
        ) VALUES (
            v_invoice_id,
            v_org_id,
            p_invoice->>'invoice_number',
            (p_invoice->>'supplier_id')::uuid,
            (p_invoice->>'warehouse_id')::uuid,
            COALESCE((p_invoice->>'invoice_date')::date, CURRENT_DATE),
            (p_invoice->>'total_amount')::numeric,
            COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            COALESCE((p_invoice->>'subtotal')::numeric, 0),
            COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            p_invoice->>'notes',
            'draft',
            COALESCE(p_invoice->>'currency', 'EGP'),
            COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            NOW()
        );
    END IF;

    DELETE FROM public.purchase_invoice_items WHERE purchase_invoice_id = v_invoice_id;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.purchase_invoice_items (
                id,
                organization_id,
                purchase_invoice_id,
                product_id,
                quantity,
                unit_price,
                uom_id,
                total,
                batch_number,
                expiry_date
            ) VALUES (
                gen_random_uuid(),
                v_org_id,
                v_invoice_id,
                (v_item->>'product_id')::uuid,
                (v_item->>'quantity')::numeric,
                (v_item->>'unit_price')::numeric,
                NULLIF(v_item->>'uom_id', '')::uuid,
                (v_item->>'total')::numeric,
                v_item->>'batch_number',
                NULLIF(v_item->>'expiry_date', '')::date
            );
        END LOOP;
    END IF;

    SELECT * INTO v_saved_invoice FROM public.purchase_invoices WHERE id = v_invoice_id;
    RETURN to_jsonb(v_saved_invoice);
END;
$$;

-- 6. منح الصلاحيات لجميع الأدوار لضمان عدم حدوث خطأ 403 أو 404
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid, uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_purchase_invoice_draft(jsonb, jsonb) TO authenticated, anon, service_role;
