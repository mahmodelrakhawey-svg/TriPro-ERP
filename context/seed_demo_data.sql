--  بيانات تجريبية وهمية (Seed Data) لنسخة الديمو
-- هذا الملف يحتوي على كل ما تحتاجه لملء النسخة التجريبية ببيانات واقعية

-- 1️⃣ دالة إضافة البيانات الأساسية (العملاء، الموردين، المنتجات)
CREATE OR REPLACE FUNCTION public.seed_demo_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- إضافة عملاء وهميين
    INSERT INTO public.customers (id, name, phone, email, tax_number, address, credit_limit, customer_type) VALUES
    ('d-cust-1', 'شركة الأفق للتجارة', '0501234567', 'horizon@example.com', '300123456700003', 'الرياض، حي الملز', 50000, 'store'),
    ('d-cust-2', 'مؤسسة النور للمقاولات', '0557654321', 'alnoor@example.com', '300987654300003', 'جدة، حي السلامة', 100000, 'store'),
    ('d-cust-3', 'سوبر ماركت البركة', '0533344455', 'baraka@example.com', '300112233400003', 'الدمام، حي الشاطئ', 15000, 'store'),
    ('d-cust-4', 'عميل أونلاين - محمد', '0598765432', 'mohammed.online@example.com', NULL, 'مكة المكرمة', 0, 'online'),
    ('d-cust-5', 'عميل نقدي', NULL, NULL, NULL, NULL, 0, 'store')
    ON CONFLICT (id) DO NOTHING;

    -- إضافة موردين وهميين
    INSERT INTO public.suppliers (id, name, phone, tax_number, address, contact_person) VALUES
    ('d-supp-1', 'شركة التوريدات الحديثة', '0509988776', '310123456700003', 'الرياض - الصناعية', 'أحمد علي'),
    ('d-supp-2', 'مصنع الجودة', '0551122334', '310987654300003', 'جدة - المنطقة الصناعية', 'محمد حسن')
    ON CONFLICT (id) DO NOTHING;

    -- إضافة مستودعات
    INSERT INTO public.warehouses (id, name, type) VALUES 
    ('demo-wh1', 'المستودع الرئيسي', 'warehouse'), 
    ('demo-wh2', 'فرع جدة', 'showroom') 
    ON CONFLICT (id) DO NOTHING;

    -- إضافة منتجات وهمية
    INSERT INTO public.products (id, name, sku, price, sales_price, purchase_price, stock, min_stock_level, type, category_id, warehouse_stock) VALUES
    ('d-prod-1', 'لابتوب HP ProBook 450 G9', 'HP-PB-450', 3200, 3850, 3150, 25, 5, 'stocked', NULL, '{"demo-wh1": 15, "demo-wh2": 10}'),
    ('d-prod-2', 'طابعة ليزر Canon LBP6030', 'CN-LBP-6030', 850, 975, 820, 15, 3, 'stocked', NULL, '{"demo-wh1": 10, "demo-wh2": 5}'),
    ('d-prod-3', 'حبر طابعة HP 85A أصلي', 'HP-85A', 250, 320, 240, 100, 20, 'stocked', NULL, '{"demo-wh1": 70, "demo-wh2": 30}'),
    ('d-prod-4', 'ورق تصوير A4 (كرتونة 5 حزم)', 'PPR-A4-BOX', 90, 115, 85, 200, 50, 'stocked', NULL, '{"demo-wh1": 200}'),
    ('d-prod-5', 'شاشة Dell 24 بوصة UltraSharp', 'DELL-U2421', 1100, 1350, 1050, 30, 5, 'stocked', NULL, '{"demo-wh1": 20, "demo-wh2": 10}'),
    ('d-prod-6', 'خدمة صيانة سنوية', 'SRV-MAINT-YR', 1500, 1500, 0, 9999, 0, 'service', NULL, '{}')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- 2️⃣ دالة إضافة العمليات الوهمية (فواتير، سندات صرف، سندات قبض)
CREATE OR REPLACE FUNCTION public.seed_demo_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- تعريف المتغيرات
    -- IDs for demo entities
    demo_customer_id UUID := 'd-cust-1';
    demo_supplier_id UUID := 'd-supp-1';
    demo_product_1_id UUID := 'd-prod-1';
    demo_product_2_id UUID := 'd-prod-2';
    demo_warehouse_id UUID := 'demo-wh1';
    
    -- IDs for created documents
    demo_invoice_id UUID;
    demo_purchase_invoice_id UUID;
    demo_receipt_voucher_id UUID;
    demo_payment_voucher_id UUID;
    
    -- Account IDs
    total_inventory_value NUMERIC := 0;
    cash_account_id UUID;
    customer_account_id UUID;
    supplier_account_id UUID;
    inventory_account_id UUID;
    opening_equity_account_id UUID;
    salaries_expense_account_id UUID;
    opening_entry_id UUID;
BEGIN
    -- 1. جلب الحسابات الأساسية
    SELECT id INTO cash_account_id FROM public.accounts WHERE code = '1231' LIMIT 1;
    SELECT id INTO customer_account_id FROM public.accounts WHERE code = '1221' LIMIT 1;
    SELECT id INTO supplier_account_id FROM public.accounts WHERE code = '221' LIMIT 1;
    SELECT id INTO inventory_account_id FROM public.accounts WHERE code = '1213' LIMIT 1; -- حساب مخزون منتج تام
    SELECT id INTO opening_equity_account_id FROM public.accounts WHERE code = '3999' LIMIT 1; -- حساب أرصدة افتتاحية
    SELECT id INTO salaries_expense_account_id FROM public.accounts WHERE code = '531' LIMIT 1; -- حساب الرواتب

    -- 2. إنشاء قيد افتتاحي متزن للمخزون (المنطق الحالي)
    SELECT SUM(stock * purchase_price)
    INTO total_inventory_value
    FROM public.products
    WHERE id LIKE 'd-prod-%';

    IF total_inventory_value > 0 AND inventory_account_id IS NOT NULL AND opening_equity_account_id IS NOT NULL THEN
        DELETE FROM public.journal_entries WHERE reference = 'OPEN-INV-DEMO';
        INSERT INTO public.journal_entries (transaction_date, reference, description, status)
        VALUES (NOW() - interval '10 days', 'OPEN-INV-DEMO', 'قيد رصيد افتتاحي للمخزون (ديمو)', 'posted')
        RETURNING id INTO opening_entry_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES
        (opening_entry_id, inventory_account_id, total_inventory_value, 0, 'إثبات رصيد المخزون الافتتاحي'), -- Debit Inventory (Asset)
        (opening_entry_id, opening_equity_account_id, 0, total_inventory_value, 'مقابل رصيد المخزون الافتتاحي'); -- Credit Equity
    END IF;

    -- 3. إنشاء فاتورة مبيعات آجلة مع دفعة مقدمة
    INSERT INTO public.invoices (id, customer_id, invoice_date, due_date, status, warehouse_id, subtotal, tax_amount, total_amount, paid_amount, treasury_account_id, notes)
    VALUES ('d-inv-1', demo_customer_id, NOW() - interval '5 days', NOW() + interval '25 days', 'draft', demo_warehouse_id, 4825, 723.75, 5548.75, 2000, cash_account_id, 'فاتورة تجريبية لتوضيح الدفع الجزئي.')
    ON CONFLICT (id) DO UPDATE SET total_amount = EXCLUDED.total_amount
    RETURNING id INTO demo_invoice_id;

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, price, total)
    VALUES (demo_invoice_id, demo_product_1_id, 1, 3850, 3850),
           (demo_invoice_id, demo_product_2_id, 1, 975, 975)
    ON CONFLICT (id) DO NOTHING;
    
    -- اعتماد الفاتورة لإنشاء القيد وخصم المخزون
    PERFORM public.approve_invoice(demo_invoice_id);

    -- 4. إنشاء فاتورة مشتريات
    INSERT INTO public.purchase_invoices (id, supplier_id, invoice_date, due_date, status, warehouse_id, subtotal, tax_amount, total_amount, notes)
    VALUES ('d-pinv-1', demo_supplier_id, NOW() - interval '10 days', NOW() + interval '20 days', 'draft', demo_warehouse_id, 3150, 472.50, 3622.50, 'فاتورة مشتريات تجريبية.')
    ON CONFLICT (id) DO UPDATE SET total_amount = EXCLUDED.total_amount
    RETURNING id INTO demo_purchase_invoice_id;

    INSERT INTO public.purchase_invoice_items (purchase_invoice_id, product_id, quantity, price, total)
    VALUES (demo_purchase_invoice_id, demo_product_1_id, 1, 3150, 3150)
    ON CONFLICT (id) DO NOTHING;

    PERFORM public.approve_purchase_invoice(demo_purchase_invoice_id);

    -- 5. إنشاء سند قبض (دفعة من عميل)
    INSERT INTO public.receipt_vouchers (id, voucher_number, customer_id, receipt_date, amount, notes, treasury_account_id, payment_method)
    VALUES ('d-rct-1', 'RCT-DEMO-001', demo_customer_id, NOW() - interval '1 day', 1500, 'دفعة من حساب العميل', cash_account_id, 'cash')
    ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO demo_receipt_voucher_id;

    PERFORM public.approve_receipt_voucher(demo_receipt_voucher_id, customer_account_id);

    -- 6. إنشاء سند صرف (دفعة لمورد)
    INSERT INTO public.payment_vouchers (id, voucher_number, supplier_id, payment_date, amount, notes, treasury_account_id, payment_method)
    VALUES ('d-pay-1', 'PAY-DEMO-001', demo_supplier_id, NOW() - interval '2 days', 1000, 'دفعة تحت الحساب للمورد', cash_account_id, 'cash')
    ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO demo_payment_voucher_id;

    PERFORM public.approve_payment_voucher(demo_payment_voucher_id, supplier_account_id);

    -- 7. إنشاء قيد مصروفات يدوي (مثال: رواتب)
    IF salaries_expense_account_id IS NOT NULL AND cash_account_id IS NOT NULL THEN
        DELETE FROM public.journal_entries WHERE reference = 'SAL-DEMO-01';
        INSERT INTO public.journal_entries (transaction_date, reference, description, status)
        VALUES (NOW() - interval '1 day', 'SAL-DEMO-01', 'إثبات مصروف رواتب شهر أغسطس (ديمو)', 'posted')
        RETURNING id INTO opening_entry_id; -- Reusing variable for simplicity

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES
        (opening_entry_id, salaries_expense_account_id, 8500, 0, 'مصروف رواتب'),
        (opening_entry_id, cash_account_id, 0, 8500, 'دفع نقدي');
    END IF;

END;
$$;