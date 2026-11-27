-- 🌟 إصلاح عزل المنظمات وتوحيد أكواد الحسابات في دوال الترحيل (متوافق مع حراس التوازن وعدم قابلية التعديل 2026-11-20)
-- يعالج الحالات التي كانت تستخدم organizations LIMIT 1 في الإشعارات أو تفتقد fallback المنظمة/الحسابات في مرتجع المبيعات:
--   1. approve_credit_note
--   2. approve_debit_note
--   3. approve_sales_return
-- ملاحظة: دالتا approve_payment_voucher و approve_receipt_voucher محصنتان بالفعل في هجرة 2026-11-20 ولا يتم استبدالهما هنا حفاظاً على منطق القيد المسودة وإعادة احتساب الأرصدة.

-- 1. approve_credit_note
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_note record;
    v_org_id uuid;
    v_sales_allowance_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار الدائن غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;

    v_org_id := COALESCE(v_note.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'تعذر تحديد المنظمة للإشعار الدائن.'; END IF;

    SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('412', '413', '4102') LIMIT 1;
    IF v_sales_allowance_acc_id IS NULL THEN
        SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('411', '4101') LIMIT 1;
    END IF;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('2231', '2103') LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1221', '1102') LIMIT 1;

    IF v_sales_allowance_acc_id IS NULL OR v_customer_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة';
    END IF;

    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id
    ) VALUES (
        v_note.note_date,
        'إشعار دائن رقم ' || COALESCE(v_note.credit_note_number, '-'),
        v_note.credit_note_number,
        'draft',
        v_org_id,
        p_note_id,
        'credit_note',
        false,
        auth.uid()
    ) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_allowance_acc_id, v_note.amount_before_tax, 0, 'مسموحات مبيعات - ' || v_note.credit_note_number, v_org_id);

    IF COALESCE(v_note.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_note.tax_amount, 0, 'ضريبة (إشعار دائن) - ' || v_note.credit_note_number, v_org_id);
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_customer_acc_id, 0, v_note.total_amount, 'إشعار دائن للعميل - ' || v_note.credit_note_number, v_org_id);

    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
    UPDATE public.credit_notes SET status = 'posted', organization_id = v_org_id, related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;

-- 2. approve_debit_note
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_note record;
    v_org_id uuid;
    v_purchase_discount_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار المدين غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;

    v_org_id := COALESCE(v_note.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'تعذر تحديد المنظمة للإشعار المدين.'; END IF;

    SELECT id INTO v_purchase_discount_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('513', '5102', '511', '5101') LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1241', '1205') LIMIT 1;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('2231', '2103') LIMIT 1;
    END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('201', '2201', '2101') LIMIT 1;

    IF v_purchase_discount_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المشتريات أو الموردين غير معرّفة';
    END IF;

    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id
    ) VALUES (
        v_note.note_date,
        'إشعار مدين رقم ' || COALESCE(v_note.debit_note_number, '-'),
        v_note.debit_note_number,
        'draft',
        v_org_id,
        p_note_id,
        'debit_note',
        false,
        auth.uid()
    ) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, v_note.total_amount, 0, 'إشعار مدين للمورد - ' || v_note.debit_note_number, v_org_id);

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_note.amount_before_tax, 'تسوية مشتريات - ' || v_note.debit_note_number, v_org_id);

    IF COALESCE(v_note.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_note.tax_amount, 'ضريبة (إشعار مدين) - ' || v_note.debit_note_number, v_org_id);
    END IF;

    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
    UPDATE public.debit_notes SET status = 'posted', organization_id = v_org_id, related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;

-- 3. approve_sales_return
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
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    v_org_id := COALESCE(v_return.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'تعذر تحديد المنظمة لمرتجع المبيعات.'; END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_return_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE code IN ('412', '413', '4102') AND organization_id = v_org_id LIMIT 1),
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1)
    );
    v_vat_acc_id := COALESCE(public.safe_cast_uuid(v_mappings->>'VAT'), (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE(public.safe_cast_uuid(v_mappings->>'CUSTOMERS'), (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE(public.safe_cast_uuid(v_mappings->>'COGS'), (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE(public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'), (SELECT id FROM public.accounts WHERE code IN ('10302', '1105', '103') AND organization_id = v_org_id LIMIT 1));

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

            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))],
                    to_jsonb(COALESCE((warehouse_stock->>COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1)))::numeric, 0) + v_base_qty)
                )
            WHERE id = v_item.product_id;
        END;
    END LOOP;

    IF v_return.related_journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_return.related_journal_entry_id;
    END IF;

    UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE organization_id = v_org_id AND reference = v_return.return_number;
    DELETE FROM public.journal_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number);
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'draft', v_org_id, p_return_id, 'sales_return', false, auth.uid())
    RETURNING id INTO v_journal_id;

    IF v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);
    END IF;

    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id);
    END IF;

    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    END IF;

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

    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
    UPDATE public.sales_returns SET status = 'posted', organization_id = v_org_id, related_journal_entry_id = v_journal_id WHERE id = p_return_id;
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;
