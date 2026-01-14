-- هذا الملف يضيف المزيد من البيانات الوهمية (فواتير، سندات) للنسخة التجريبية
-- لجعل النظام يبدو أكثر واقعية وحيوية.
-- يمكن تشغيله عدة مرات بأمان.

DO $$
DECLARE
    -- Account IDs
    v_inventory_acc_id uuid; v_cogs_acc_id uuid; v_sales_acc_id uuid; v_cash_acc_id uuid; v_customers_acc_id uuid; v_suppliers_acc_id uuid; v_vat_acc_id uuid;

    -- Entity IDs
    v_customer_horizon_id uuid; v_customer_benaa_id uuid;
    v_supplier_cables_id uuid;
    v_product_router_id uuid; v_product_cable_id uuid;

    -- Document IDs
    v_invoice_id uuid;
    v_purchase_invoice_id uuid;
    v_journal_id uuid;
    v_warehouse_id uuid;
BEGIN
    -- 1. Get IDs for existing entities (created by the initial seed)
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '1105' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM public.accounts WHERE code = '110101' LIMIT 1;
    SELECT id INTO v_customers_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1;
    SELECT id INTO v_suppliers_acc_id FROM public.accounts WHERE code = '2201' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2103' LIMIT 1;

    SELECT id INTO v_customer_horizon_id FROM public.customers WHERE name = 'مؤسسة الأفق للتجارة' LIMIT 1;
    SELECT id INTO v_customer_benaa_id FROM public.customers WHERE name = 'شركة البناء الحديث' LIMIT 1;
    SELECT id INTO v_supplier_cables_id FROM public.suppliers WHERE name = 'مصنع الخليج للكابلات' LIMIT 1;
    
    SELECT id INTO v_product_router_id FROM public.products WHERE sku = 'RTR-5G-PRO' LIMIT 1;
    SELECT id INTO v_product_cable_id FROM public.products WHERE sku = 'CBL-CAT6' LIMIT 1;
    
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE name = 'المستودع الرئيسي' LIMIT 1;

    -- Check if essential data exists
    IF v_customer_horizon_id IS NULL OR v_product_router_id IS NULL THEN
        RAISE NOTICE 'البيانات الأساسية غير موجودة. يرجى تنفيذ ملف الإعداد الشامل أولاً.';
        RETURN;
    END IF;

    -- 2. Create a new Purchase Invoice to stock up
    INSERT INTO public.purchase_invoices (invoice_number, supplier_id, invoice_date, total_amount, tax_amount, status, warehouse_id)
    VALUES ('PUR-DEMO-101', v_supplier_cables_id, current_date - interval '7 days', 2300, 300, 'posted', v_warehouse_id)
    ON CONFLICT (invoice_number) DO NOTHING;

    -- 3. Create a new Sales Invoice (Credit)
    INSERT INTO public.invoices (invoice_number, customer_id, invoice_date, total_amount, tax_amount, subtotal, status, notes, paid_amount, warehouse_id)
    VALUES ('INV-DEMO-102', v_customer_benaa_id, current_date - interval '3 days', 1380, 180, 1200, 'posted', 'فاتورة آجلة', 0, v_warehouse_id)
    ON CONFLICT (invoice_number) DO NOTHING
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NOT NULL THEN
        INSERT INTO public.invoice_items (invoice_id, product_id, quantity, price, total, cost)
        VALUES (v_invoice_id, v_product_router_id, 1, 1200, 1200, 850);
    END IF;

    -- 4. Create a Receipt Voucher for the first invoice
    INSERT INTO public.receipt_vouchers (voucher_number, customer_id, receipt_date, amount, notes, treasury_account_id)
    VALUES ('RCT-DEMO-101', v_customer_horizon_id, current_date - interval '1 day', 517.5, 'تحصيل قيمة فاتورة INV-001001', v_cash_acc_id)
    ON CONFLICT (voucher_number) DO NOTHING;

    -- 5. Create a Payment Voucher to a supplier
    INSERT INTO public.payment_vouchers (voucher_number, supplier_id, payment_date, amount, notes, treasury_account_id)
    VALUES ('PAY-DEMO-101', v_supplier_cables_id, current_date, 2300, 'سداد فاتورة مشتريات PUR-DEMO-101', v_cash_acc_id)
    ON CONFLICT (voucher_number) DO NOTHING;

END $$;

SELECT 'تمت إضافة المزيد من البيانات الوهمية بنجاح! 🚀' as result;