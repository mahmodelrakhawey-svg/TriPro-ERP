-- 🔒 تفعيل نظام الحماية (RLS) لجميع جداول النظام
-- هذا السكربت يقوم بتفعيل Row Level Security ويسمح فقط للمستخدمين المسجلين بالوصول للبيانات

BEGIN;

-- دالة مساعدة لتفعيل الحماية وإنشاء سياسة الوصول
CREATE OR REPLACE FUNCTION enable_rls_for_table(tbl text) RETURNS void AS $$
BEGIN
    -- 1. تفعيل RLS على الجدول
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    
    -- 2. حذف السياسات القديمة إن وجدت لتجنب التكرار
    EXECUTE format('DROP POLICY IF EXISTS "Allow access to authenticated users" ON public.%I;', tbl);
    
    -- 3. إنشاء سياسة تسمح للمستخدمين المسجلين فقط (authenticated) بالقراءة والكتابة
    -- هذا يعني أن أي شخص غير مسجل دخول لن يرى أي بيانات
    EXECUTE format('CREATE POLICY "Allow access to authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
END;
$$ LANGUAGE plpgsql;

-- دالة مساعدة لجدول المستخدمين (Profiles) لسياسات أكثر تحديداً
CREATE OR REPLACE FUNCTION secure_profiles_table() RETURNS void AS $$
BEGIN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
    CREATE POLICY "Allow authenticated users to read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Allow users to update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
END;
$$ LANGUAGE plpgsql;

-- تطبيق الحماية على جميع الجداول
SELECT enable_rls_for_table('accounts');
SELECT enable_rls_for_table('journal_entries');
SELECT enable_rls_for_table('journal_lines');
SELECT enable_rls_for_table('journal_attachments');
SELECT enable_rls_for_table('products');
SELECT enable_rls_for_table('customers');
SELECT enable_rls_for_table('suppliers');
SELECT enable_rls_for_table('warehouses');
SELECT enable_rls_for_table('invoices');
SELECT enable_rls_for_table('invoice_items');
SELECT enable_rls_for_table('receipt_vouchers');
SELECT enable_rls_for_table('payment_vouchers');
SELECT enable_rls_for_table('receipt_voucher_attachments');
SELECT enable_rls_for_table('payment_voucher_attachments');
SELECT enable_rls_for_table('cheques');
SELECT enable_rls_for_table('cheque_attachments');
SELECT enable_rls_for_table('assets');
SELECT enable_rls_for_table('employees');
SELECT enable_rls_for_table('purchase_invoices');
SELECT enable_rls_for_table('purchase_invoice_items');
SELECT enable_rls_for_table('sales_returns');
SELECT enable_rls_for_table('sales_return_items');
SELECT enable_rls_for_table('purchase_returns');
SELECT enable_rls_for_table('purchase_return_items');
SELECT enable_rls_for_table('quotations');
SELECT enable_rls_for_table('quotation_items');
SELECT enable_rls_for_table('purchase_orders');
SELECT enable_rls_for_table('purchase_order_items');
SELECT enable_rls_for_table('stock_transfers');
SELECT enable_rls_for_table('stock_transfer_items');
SELECT enable_rls_for_table('stock_adjustments');
SELECT enable_rls_for_table('stock_adjustment_items');
SELECT enable_rls_for_table('inventory_counts');
SELECT enable_rls_for_table('inventory_count_items');
SELECT enable_rls_for_table('payrolls');
SELECT enable_rls_for_table('payroll_items');
SELECT enable_rls_for_table('employee_advances');
SELECT enable_rls_for_table('cash_closings');
SELECT enable_rls_for_table('bank_reconciliations');
SELECT enable_rls_for_table('security_logs');
SELECT enable_rls_for_table('notifications');
SELECT enable_rls_for_table('organizations');
SELECT enable_rls_for_table('company_settings');
SELECT enable_rls_for_table('item_categories');
SELECT enable_rls_for_table('opening_inventories');
SELECT enable_rls_for_table('rejected_cash_closings');
SELECT enable_rls_for_table('work_orders');
SELECT enable_rls_for_table('work_order_costs');

-- تطبيق الحماية المخصصة لجدول المستخدمين
SELECT secure_profiles_table();

-- تنظيف الدالة المساعدة
DROP FUNCTION enable_rls_for_table(text);
DROP FUNCTION secure_profiles_table();

COMMIT;