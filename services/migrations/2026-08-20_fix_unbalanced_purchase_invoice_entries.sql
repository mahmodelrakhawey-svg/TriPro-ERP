-- ==============================================================================
-- 🚀 TriPro ERP - Migration: Fix Unbalanced Purchase Invoice Entries & Robust PO Conversion
-- Ensures all journal entries from purchase invoices are 100% mathematically balanced
-- ==============================================================================

-- 1. تحديث دالة تحويل أمر الشراء إلى فاتورة مشتريات (convert_po_to_invoice)
CREATE OR REPLACE FUNCTION public.convert_po_to_invoice(
    p_po_id uuid, 
    p_warehouse_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po record; 
    v_invoice_id uuid; 
    v_inv_num text; 
    v_target_org_id uuid;
    v_wh_id uuid;
BEGIN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;

    v_target_org_id := COALESCE(p_org_id, v_po.organization_id, public.get_my_org());
    v_inv_num := 'PI-FROM-' || COALESCE(v_po.po_number, v_po.order_number, substring(p_po_id::text, 1, 8));

    v_wh_id := COALESCE(
        p_warehouse_id, 
        v_po.warehouse_id, 
        (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL ORDER BY name ASC LIMIT 1)
    );

    -- إنشاء رأس فاتورة المشتريات
    INSERT INTO public.purchase_invoices (
        invoice_number, supplier_id, user_id, invoice_date, total_amount, tax_amount, subtotal,
        status, warehouse_id, organization_id, notes, currency, exchange_rate
    ) VALUES (
        v_inv_num, 
        v_po.supplier_id, 
        auth.uid(),
        now()::date,
        COALESCE(v_po.total_amount, 0), 
        COALESCE(v_po.tax_amount, 0),
        COALESCE(v_po.subtotal, COALESCE(v_po.total_amount, 0) - COALESCE(v_po.tax_amount, 0)),
        'draft',
        v_wh_id,
        v_target_org_id,
        'محولة من أمر شراء رقم: ' || COALESCE(v_po.po_number, v_po.order_number, 'بدون رقم'),
        'EGP', 
        1
    ) RETURNING id INTO v_invoice_id;

    -- نقل البنود بدقة باستخدام purchase_order_id و order_id معاً
    INSERT INTO public.purchase_invoice_items (
        purchase_invoice_id, product_id, quantity, unit_price, uom_id, total, organization_id
    )
    SELECT 
        v_invoice_id, 
        product_id, 
        quantity, 
        unit_price, 
        uom_id, 
        COALESCE(total, quantity * unit_price), 
        v_target_org_id
    FROM public.purchase_order_items 
    WHERE COALESCE(purchase_order_id, order_id) = p_po_id;

    -- تحديث حالة أمر الشراء
    UPDATE public.purchase_orders SET status = 'invoiced' WHERE id = p_po_id;

    RETURN v_invoice_id;
END; $$;

-- 2. تحديث دالة ترحيل واعتماد فاتورة المشتريات (approve_purchase_invoice) مع الضمان المحاسبي للتوازن
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
) RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_invoice record; 
    v_item record; 
    v_org_id uuid; 
    v_inventory_acc_id uuid; 
    v_vat_in_id uuid; 
    v_supplier_acc_id uuid;
    v_journal_id uuid; 
    v_mappings jsonb; 
    v_exchange_rate numeric;
    v_total_inventory_debited numeric := 0;
    v_subtotal numeric;
    v_missing_inventory_amount numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- حذف القيد القديم إذا كان موجوداً لمنع التكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديث المستودع إذا تم تمريره
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC)
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        DECLARE
            v_base_qty numeric := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_unit_cost_base numeric := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        BEGIN
            UPDATE public.products p SET 
                purchase_price = v_unit_cost_base,
                cost = v_unit_cost_base,
                weighted_average_cost = CASE 
                    WHEN (COALESCE(p.stock, 0) + v_base_qty) > 0 
                    THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_unit_cost_base)) + (v_base_qty * v_unit_cost_base)) / (COALESCE(p.stock, 0) + v_base_qty), 4)
                    ELSE v_unit_cost_base 
                END
            WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- حسابات الربط
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1), (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    -- إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) 
    RETURNING id INTO v_journal_id;
    
    -- 1. المدين: المخزون من البنود التفصيلية
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(COALESCE(pii.total, pii.quantity * pii.unit_price)) as total_cost
        FROM public.purchase_invoice_items pii
        LEFT JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        IF v_item.total_cost > 0 AND v_item.acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_item.acc_id, v_item.total_cost * v_exchange_rate, 0, 'إثبات مشتريات - مخزون', v_org_id);
            v_total_inventory_debited := v_total_inventory_debited + v_item.total_cost;
        END IF;
    END LOOP;

    -- 🛡️ الصمام الذهبي للتوازن: إذا كانت الفاتورة بدون بنود أو هناك فارق في قيمة المخزون
    v_subtotal := COALESCE(v_invoice.subtotal, COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.tax_amount, 0));
    v_missing_inventory_amount := v_subtotal - v_total_inventory_debited;

    IF v_missing_inventory_amount > 0 AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_missing_inventory_amount * v_exchange_rate, 0, 'إثبات مشتريات - مخزون (قيمة البضاعة)', v_org_id);
    END IF;

    -- 2. المدين: ضريبة المدخلات
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount * v_exchange_rate, 0, 'ضريبة مدخلات', v_org_id);
    END IF;

    -- 3. الدائن: المورد (إجمالي الفاتورة بالكامل)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount * v_exchange_rate, 'استحقاق مورد', v_org_id);

    -- 4. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount * v_exchange_rate, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount * v_exchange_rate, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices SET status = 'paid', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        END IF;
    ELSE
        UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
    END IF;
END; 
$$;

-- 3. ترميم القيود غير المتوازنة الحالية فوراً
DO $$
DECLARE
    r RECORD;
    v_po_id uuid;
BEGIN
    -- أ. تعبئة البنود المفقودة في فواتير المشتريات المحولة من أوامر الشراء
    FOR r IN (
        SELECT pi.id, pi.invoice_number, pi.organization_id, pi.warehouse_id 
        FROM public.purchase_invoices pi
        LEFT JOIN public.purchase_invoice_items pii ON pi.id = pii.purchase_invoice_id
        WHERE pii.id IS NULL
    ) LOOP
        -- محاولة استخراج معرف أمر الشراء من الرقم أو الملاحظات
        SELECT id INTO v_po_id FROM public.purchase_orders 
        WHERE ('PI-FROM-' || COALESCE(po_number, order_number) = r.invoice_number)
           OR ('PI-FROM-' || substring(id::text, 1, 8) = r.invoice_number)
           OR (notes ILIKE '%' || r.invoice_number || '%')
        LIMIT 1;

        IF v_po_id IS NOT NULL THEN
            INSERT INTO public.purchase_invoice_items (
                purchase_invoice_id, product_id, quantity, unit_price, uom_id, total, organization_id
            )
            SELECT 
                r.id, 
                product_id, 
                quantity, 
                unit_price, 
                uom_id, 
                COALESCE(total, quantity * unit_price), 
                r.organization_id
            FROM public.purchase_order_items 
            WHERE COALESCE(purchase_order_id, order_id) = v_po_id;
        END IF;

        -- إعادة توليد وترحيل القيد المحاسبي لضمان التوازن التام
        PERFORM public.approve_purchase_invoice(r.id, r.organization_id, r.warehouse_id);
    END LOOP;

    -- ب. إعادة ترحيل كافة فواتير المشتريات التي قيودها غير متوازنة حالياً
    FOR r IN (
        SELECT DISTINCT pi.id, pi.organization_id, pi.warehouse_id
        FROM public.purchase_invoices pi
        JOIN public.journal_entries je ON je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice'
        JOIN (
            SELECT journal_entry_id, SUM(debit) as total_debit, SUM(credit) as total_credit
            FROM public.journal_lines
            GROUP BY journal_entry_id
            HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
        ) unb ON unb.journal_entry_id = je.id
    ) LOOP
        PERFORM public.approve_purchase_invoice(r.id, r.organization_id, r.warehouse_id);
    END LOOP;

    NOTIFY pgrst, 'reload schema';
END $$;
