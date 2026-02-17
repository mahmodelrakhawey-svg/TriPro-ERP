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
    demo_customer_id UUID := 'd-cust-1';
    demo_supplier_id UUID := 'd-supp-1';
    demo_product_1_id UUID := 'd-prod-1';
    demo_product_3_id UUID := 'd-prod-3';
    demo_warehouse_id UUID := 'demo-wh1';
    
    demo_invoice_id UUID;
    demo_payment_voucher_id UUID;
    demo_receipt_voucher_id UUID;
    
    cash_account_id UUID;
    supplier_account_id UUID;
    customer_account_id UUID;
BEGIN
    -- جلب الحسابات اللازمة (الصندوق، الموردين، العملاء)
    SELECT id INTO cash_account_id FROM public.accounts WHERE code = '1231' LIMIT 1;
    SELECT id INTO supplier_account_id FROM public.accounts WHERE code = '201' LIMIT 1;
    SELECT id INTO customer_account_id FROM public.accounts WHERE code = '10201' LIMIT 1;

    -- أ) إنشاء فاتورة مبيعات وهمية
    -- نحذفها أولاً إذا كانت موجودة لتجنب التكرار عند إعادة التشغيل
    DELETE FROM public.invoice_items WHERE invoice_id = 'd-inv-1';
    DELETE FROM public.invoices WHERE id = 'd-inv-1';

    INSERT INTO public.invoices (
        id, customer_id, invoice_date, due_date, status, warehouse_id, 
        subtotal, tax_amount, total_amount, paid_amount, treasury_account_id, notes
    ) VALUES (
        'd-inv-1', demo_customer_id, NOW() - interval '5 days', NOW() + interval '25 days', 'draft', demo_warehouse_id,
        4170, 625.50, 4795.50, 2000, cash_account_id, 'فاتورة تجريبية أولى لتوضيح إمكانيات النظام.'
    ) RETURNING id INTO demo_invoice_id;

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, price, total) VALUES
    (demo_invoice_id, demo_product_1_id, 1, 3850, 3850),
    (demo_invoice_id, demo_product_3_id, 1, 320, 320);

    -- اعتماد الفاتورة (يولد القيد ويخصم المخزون)
    PERFORM public.approve_invoice(demo_invoice_id);

    -- ب) إنشاء سند صرف وهمي (دفعة لمورد)
    IF cash_account_id IS NOT NULL AND supplier_account_id IS NOT NULL THEN
        INSERT INTO public.payment_vouchers (
            voucher_number, supplier_id, payment_date, amount, notes, treasury_account_id, payment_method
        ) VALUES (
            'PAY-DEMO-001', demo_supplier_id, NOW(), 1500, 'دفعة مقدمة للمورد - تجربة الديمو', cash_account_id, 'cash'
        ) RETURNING id INTO demo_payment_voucher_id;

        -- اعتماد سند الصرف
        PERFORM public.approve_payment_voucher(demo_payment_voucher_id, supplier_account_id);
    END IF;

    -- ج) إنشاء سند قبض وهمي (دفعة من عميل)
    IF cash_account_id IS NOT NULL AND customer_account_id IS NOT NULL THEN
        INSERT INTO public.receipt_vouchers (
            voucher_number, customer_id, receipt_date, amount, notes, treasury_account_id, payment_method
        ) VALUES (
            'RCT-DEMO-001', demo_customer_id, NOW(), 1000, 'دفعة من حساب العميل - تجربة الديمو', cash_account_id, 'cash'
        ) RETURNING id INTO demo_receipt_voucher_id;

        -- اعتماد سند القبض
        PERFORM public.approve_receipt_voucher(demo_receipt_voucher_id, customer_account_id);
    END IF;

END;
$$;

-- 🚀 إضافة عمليات وهمية (فواتير، سندات) لجعل الديمو أكثر حيوية
CREATE OR REPLACE FUNCTION public.seed_demo_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- معرفات وهمية من البيانات الأساسية التي تم إنشاؤها في seed_demo_tables
    demo_customer_id UUID := 'd-cust-1'; -- شركة الأفق للتجارة
    demo_supplier_id UUID := 'd-supp-1'; -- شركة التوريدات الحديثة
    demo_product_1_id UUID := 'd-prod-1'; -- لابتوب
    demo_product_3_id UUID := 'd-prod-3'; -- حبر طابعة
    demo_warehouse_id UUID := 'demo-wh1'; -- المستودع الرئيسي
    demo_invoice_id UUID;
    demo_payment_voucher_id UUID;
    cash_account_id UUID;
    supplier_account_id UUID;
BEGIN
    -- 1️⃣ جلب حساب الصندوق الرئيسي لاستخدامه في الدفع الجزئي للفاتورة
    -- نفترض أن دليل الحسابات موجود بالفعل في قاعدة بيانات الديمو
    SELECT id INTO cash_account_id FROM public.accounts WHERE code = '1231' LIMIT 1;
    
    -- جلب حساب الموردين (للاعتماد)
    SELECT id INTO supplier_account_id FROM public.accounts WHERE code = '201' LIMIT 1;

    -- 2️⃣ إنشاء فاتورة مبيعات وهمية (كمسودة أولاً)
    INSERT INTO public.invoices (
        id, customer_id, invoice_date, due_date, status, warehouse_id, 
        subtotal, tax_amount, total_amount, paid_amount, treasury_account_id, notes
    ) VALUES (
        'd-inv-1', demo_customer_id, NOW() - interval '5 days', NOW() + interval '25 days', 'draft', demo_warehouse_id,
        4170, 625.50, 4795.50, 2000, cash_account_id, 'فاتورة تجريبية أولى لتوضيح إمكانيات النظام.'
    ) RETURNING id INTO demo_invoice_id;

    -- 3️⃣ إضافة بنود الفاتورة
    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, price, total) VALUES
    (demo_invoice_id, demo_product_1_id, 1, 3850, 3850), -- لابتوب
    (demo_invoice_id, demo_product_3_id, 1, 320, 320);   -- حبر

    -- 4️⃣ اعتماد الفاتورة لإنشاء القيد المحاسبي وتحديث المخزون تلقائياً
    -- هذا يستدعي الدالة التي يستخدمها البرنامج فعلياً، مما يضمن الواقعية
    PERFORM public.approve_invoice(demo_invoice_id);

    -- 5️⃣ إنشاء سند صرف وهمي (دفعة لمورد)
    IF cash_account_id IS NOT NULL AND supplier_account_id IS NOT NULL THEN
        INSERT INTO public.payment_vouchers (
            voucher_number, supplier_id, payment_date, amount, notes, treasury_account_id, payment_method
        ) VALUES (
            'PAY-DEMO-001', demo_supplier_id, NOW(), 1500, 'دفعة مقدمة للمورد - تجربة الديمو', cash_account_id, 'cash'
        ) RETURNING id INTO demo_payment_voucher_id;

        -- اعتماد سند الصرف
        PERFORM public.approve_payment_voucher(demo_payment_voucher_id, supplier_account_id);
    END IF;

END;
$$;