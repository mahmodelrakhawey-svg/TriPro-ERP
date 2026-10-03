-- ==============================================================================
-- Migration: Fix Purchase Invoice Balance Guard Rounding & Auto-Balancing (Safe Version)
-- Date: 2026-10-03
-- ==============================================================================

-- 1. تحديث صمام أمان رأس القيد (سماحية فروق التقريب حتى 0.05)
CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sum_debit NUMERIC;
    v_sum_credit NUMERIC;
    v_line_count INTEGER;
BEGIN
    IF (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines
         WHERE journal_entry_id = NEW.id;

        IF TG_OP = 'UPDATE' THEN
            IF (NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted' OR OLD.is_posted IS DISTINCT FROM true))
               OR (NEW.is_posted = true AND OLD.is_posted IS DISTINCT FROM true) THEN
                
                IF v_line_count < 2 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) لأنه لا يحتوي على طرفين محاسبيين على الأقل (مدين ودائن).', 
                        COALESCE(NEW.reference, NEW.id::text);
                END IF;

                IF ABS(v_sum_debit - v_sum_credit) > 0.05 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) لعدم توازن المدين مع الدائن! (إجمالي المدين: %, إجمالي الدائن: %, الفرق: %).',
                        COALESCE(NEW.reference, NEW.id::text), v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
                END IF;

                IF v_sum_debit <= 0 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) بمبالغ صفرية أو سالبة.',
                        COALESCE(NEW.reference, NEW.id::text);
                END IF;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. تحديث صمام أمان أسطر القيد (سماحية فروق التقريب حتى 0.05)
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_entry_id UUID;
    v_status TEXT;
    v_is_posted BOOLEAN;
    v_reference TEXT;
    v_sum_debit NUMERIC;
    v_sum_credit NUMERIC;
    v_line_count INTEGER;
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    IF v_entry_id IS NULL THEN RETURN NULL; END IF;

    SELECT status, is_posted, reference INTO v_status, v_is_posted, v_reference
      FROM public.journal_entries WHERE id = v_entry_id;

    IF NOT FOUND THEN RETURN NULL; END IF;

    IF v_status = 'posted' OR v_is_posted = true THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines WHERE journal_entry_id = v_entry_id;

        IF v_line_count = 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترك القيد المرحل (%) بدون أسطر محاسبية.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;

        IF ABS(v_sum_debit - v_sum_credit) > 0.05 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: عملية التعديل أو الحذف تجعل القيد المرحل (%) غير متوازن! (إجمالي المدين: %, إجمالي الدائن: %, الفرق: %).',
                COALESCE(v_reference, v_entry_id::text), v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
        END IF;

        IF v_sum_debit <= 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن حفظ أسطر القيد المرحل (%) بمبالغ صفرية أو سالبة.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- 3. تحديث دالة ترحيل فاتورة المشتريات بميزة التوازن التلقائي
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    v_tax_amount numeric := 0;
    v_total_amount numeric := 0;
    v_paid_amount numeric := 0;
    v_inv_debit_amount numeric := 0;
    v_entry_diff numeric := 0;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id; END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'تعذر تحديد هوية المنظمة لفاتورة المشتريات.'; END IF;

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));
    
    v_discount_amount := COALESCE((to_jsonb(v_invoice)->>'discount_amount')::numeric, 0);
    v_total_amount := COALESCE(v_invoice.total_amount, 0);
    v_tax_amount := COALESCE(v_invoice.tax_amount, 0);
    v_paid_amount := COALESCE(v_invoice.paid_amount, 0);
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- حساب قيمة المخزون لضمان التوازن الرياضي الحتمي
    v_inv_debit_amount := v_total_amount + v_discount_amount - v_tax_amount;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10301', '103', '1105') AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1241', '10204', '202', '2103') AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2101') AND organization_id = v_org_id LIMIT 1));

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

    -- تحديث المخزون ومتوسط التكلفة
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

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN v_base_qty := v_item.quantity; END IF;

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
                    to_jsonb(COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) + v_base_qty)
                ),
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty,
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- مسح أي قيود سابقة
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- إنشاء القيد المحاسبي المتوازن
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

    -- 1. المدين: المخزون
    IF v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_inv_debit_amount, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END IF;

    -- 2. المدين: ضريبة المدخلات
    IF v_tax_amount > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- 3. الدائن: الخصم المكتسب
    IF v_discount_amount > 0 AND v_purchase_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_discount_amount, 'خصم مكتسب على المشتريات', v_org_id);
    END IF;

    -- 4. الدائن: استحقاق المورد
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

    -- 6. صمام الموازنة الدقيقة لفروق الكسور (Auto-Balancing)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_entry_diff
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id;

    IF ABS(v_entry_diff) > 0 AND ABS(v_entry_diff) <= 0.05 THEN
        UPDATE public.journal_lines
        SET debit = debit - v_entry_diff
        WHERE journal_entry_id = v_journal_id AND account_id = v_inventory_acc_id;
    END IF;

    UPDATE public.purchase_invoices 
    SET status = CASE WHEN (v_total_amount - v_paid_amount) <= 0.01 THEN 'paid' ELSE 'posted' END, 
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

-- 4. إنشاء دوال post_purchase_invoice المستعارة وضمان وجودها
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id, NULL, NULL);
END;
$$;

-- 5. منح الصلاحيات بطريقة آمنة
DO $$ BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated, service_role, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid, uuid, uuid) TO authenticated, service_role, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated, service_role, anon';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
