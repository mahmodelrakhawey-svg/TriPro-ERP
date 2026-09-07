-- 🛠️ تحديث دالة اعتماد فاتورة المبيعات لإدراج قيد السداد الفوري/الدفعة المقدمة وإعادة حساب الأرصدة
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
) RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_invoice record; v_org_id uuid; v_journal_id uuid; v_mappings jsonb;
    v_sales_acc_id uuid; v_vat_acc_id uuid; v_cust_acc_id uuid; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_item record;
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة.'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    
    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة من الواجهة لضمان دقة خصم المخزون اللحظي
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != v_invoice.warehouse_id THEN
        UPDATE public.invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
        v_invoice.warehouse_id := p_warehouse_id;
    END IF;

    -- 2. جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cust_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. حساب تكلفة البضاعة المباعة وتحديث بيانات البنود
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        DECLARE v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
            UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;
        END;
    END LOOP;

    -- 📝 4. إنشاء قيد اليومية المزدوج
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || v_invoice.invoice_number, v_invoice.invoice_number, 'posted', v_org_id, true, p_invoice_id, 'invoice') RETURNING id INTO v_journal_id;

    -- سطر المدين: استحقاق المبيعات للعميل (القيمة الكاملة للفاتورة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_cust_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات', v_org_id);
    
    -- سطر الدائن: إيراد المبيعات
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id);
    
    -- سطر الدائن: ضريبة القيمة المضافة (المخرجات)
    IF v_invoice.tax_amount > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات', v_org_id); 
    END IF;
    
    -- 5. إثبات السداد الفوري/الدفعة المقدمة (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        -- سطر مدين للخزينة/البنك (زيادة النقدية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - فاتورة مبيعات ' || v_invoice.invoice_number, v_org_id);

        -- سطر دائن للعميل (تخفيض المديونية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cust_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل - فاتورة مبيعات ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- تكلفة البضاعة المباعة والخصم من المخزون
    IF v_total_cost > 0 THEN
        FOR v_item IN 
            SELECT 
                COALESCE(p.inventory_account_id, v_inv_acc_id) as inv_acc,
                COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
                SUM(COALESCE(ii.cost, 0) * public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)) as total_item_cost
            FROM public.invoice_items ii
            JOIN public.products p ON ii.product_id = p.id
            WHERE ii.invoice_id = p_invoice_id
            GROUP BY COALESCE(p.inventory_account_id, v_inv_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
        LOOP
            IF v_item.total_item_cost > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_item.cogs_acc, v_item.total_item_cost, 0, 'تكلفة مبيعات', v_org_id);
                
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_item.inv_acc, 0, v_item.total_item_cost, 'صرف مخزون تام', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 6. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices 
    SET status = CASE WHEN ABS(COALESCE(paid_amount, 0) - COALESCE(total_amount, 0)) < 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id 
    WHERE id = p_invoice_id;

    -- 🚀 7. تحديث المخزون الشامل لجميع المستودعات (الخصم اللحظي)
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
    
    -- إعادة احتساب أرصدة الأستاذ العام وكشوف الحسابات للعملاء والموردين للشركة
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; 
$$;

-- منح الصلاحيات للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid, boolean) TO authenticated;
