-- 🛠️ تحديث دالة اعتماد فاتورة المشتريات لإدراج قيد السداد الفوري وإعادة حساب الأرصدة
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
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb; v_exchange_rate numeric;
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

    -- تحديث متوسط التكلفة (WAC) قبل إعادة احتساب المخزون
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        -- 🚀 تحويل الكمية إلى الوحدة الأساسية قبل حساب التكلفة
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

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    -- 1. المدين: المخزون (مقسم حسب حساب المخزون الخاص بكل منتج)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pii.total) as total_cost
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, v_item.total_cost * v_exchange_rate, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END LOOP;

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
        -- سطر مدين للمورد (تخفيض المديونية بقيمة السداد)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount * v_exchange_rate, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        -- سطر دائن للخزينة/البنك (نقص النقدية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount * v_exchange_rate, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        -- تحديث حالة الفاتورة لتصبح مدفوعة بالكامل إذا تطابق المبلغ
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices SET status = 'paid', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        END IF;
    ELSE
        UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
    END IF;

    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;

    -- إعادة احتساب أرصدة الأستاذ العام وكشوف الحسابات للشركة
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; 
$$;

-- 🛠️ دالة التحميل الأحادي المتوافقة مع الاستدعاءات الأخرى
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id, NULL, NULL, false);
END;
$$;

-- منح الصلاحيات للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated;
