-- 🛠️ إعداد بيئة الديمو (Demo Environment Setup) - نسخة مصححة ومبسطة

-- 1️⃣ إنشاء دالة للتحقق مما إذا كان المستخدم هو Demo (في public بدلاً من auth)
CREATE OR REPLACE FUNCTION public.is_demo_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role') = 'demo';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2️⃣ تفعيل RLS (Row Level Security) على الجداول الحساسة
DO $$
DECLARE
    tables text[] := ARRAY['invoices', 'invoice_items', 'customers', 'suppliers', 'products', 'journal_entries', 'journal_lines', 'receipt_vouchers', 'payment_vouchers'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        
        -- حذف السياسات القديمة (تمت إزالة كتلة BEGIN/EXCEPTION الزائدة)
        EXECUTE format('DROP POLICY IF EXISTS "prevent_delete_for_demo" ON %I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "allow_all_other_actions" ON %I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "policy_allow_select" ON %I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "policy_allow_insert" ON %I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "policy_allow_update" ON %I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "policy_allow_delete" ON %I;', t);

        -- 1. السماح بالقراءة للجميع
        EXECUTE format('
            CREATE POLICY "policy_allow_select" ON %I FOR SELECT TO authenticated USING (true);
        ', t);

        -- 2. السماح بالإضافة للجميع
        EXECUTE format('
            CREATE POLICY "policy_allow_insert" ON %I FOR INSERT TO authenticated WITH CHECK (true);
        ', t);

        -- 3. السماح بالتعديل للجميع
        EXECUTE format('
            CREATE POLICY "policy_allow_update" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
        ', t);

        -- 4. السماح بالحذف للجميع ما عدا الديمو
        EXECUTE format('
            CREATE POLICY "policy_allow_delete" ON %I FOR DELETE TO authenticated USING (NOT public.is_demo_user());
        ', t);
    END LOOP;
END $$ LANGUAGE plpgsql;

-- 3️⃣ دالة إعادة ضبط البيانات
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. تنظيف الجداول المرتبطة بالعمليات (من الابن إلى الأب لتجنب مشاكل المفاتيح الأجنبية)
    DELETE FROM public.journal_lines WHERE true;
    DELETE FROM public.journal_entries WHERE true;
    DELETE FROM public.sales_return_items WHERE true;
    DELETE FROM public.sales_returns WHERE true;
    DELETE FROM public.invoice_items WHERE true;
    DELETE FROM public.invoices WHERE true;
    DELETE FROM public.receipt_vouchers WHERE true;
    DELETE FROM public.payment_vouchers WHERE true;
    -- ... أضف أي جداول عمليات أخرى هنا
    
    -- 2. تنظيف البيانات الأساسية (العملاء، المنتجات، إلخ)
    -- سيتم إعادة إنشائها من دالة الـ seed
    DELETE FROM public.products WHERE true;
    DELETE FROM public.customers WHERE true;
    DELETE FROM public.suppliers WHERE true;
    
    -- 3. استدعاء دالة البيانات الوهمية لإعادة ملء الجداول
    -- تأكد من أن دالة seed_demo_tables() موجودة في قاعدة البيانات
    PERFORM public.seed_demo_tables();

    -- 4. استدعاء دالة إنشاء العمليات الوهمية (فواتير، سندات)
    -- هذا يجعل الديمو يبدو "حياً" من أول لحظة
    PERFORM public.seed_demo_transactions();
END;
$$;

-- 4️⃣ تحديث بيانات المستخدم (تأكد أن المستخدم demo@demo.com موجود أولاً)
UPDATE auth.users 
SET raw_user_meta_data = jsonb_build_object('app_role', 'demo', 'full_name', 'مستخدم تجريبي')
WHERE email = 'demo@demo.com';
