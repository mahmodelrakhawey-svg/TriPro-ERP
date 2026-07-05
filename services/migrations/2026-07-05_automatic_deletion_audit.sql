-- =================================================================
-- 🔒 نظام التدقيق والمراقبة التلقائي لعمليات الحذف (Auto Deletion Auditor)
-- التاريخ: 5 يوليو 2026
-- الوصف: إنشاء نظام تتبع آلي بقاعدة البيانات لرصد وحفظ تفاصيل عمليات حذف
--        الحسابات المالية، المنتجات، والعملاء وتحديد المستخدم المتسبب تلقائياً.
-- =================================================================

-- 1. إنشاء دالة التدقيق المشتركة لعمليات الحذف
CREATE OR REPLACE FUNCTION public.fn_audit_deletions()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_item_name text;
BEGIN
    -- أ. تحديد اسم وتفاصيل العنصر المحذوف بناءً على الجدول المستهدف
    CASE TG_TABLE_NAME
        WHEN 'accounts' THEN
            v_item_name := OLD.name || ' (كود: ' || COALESCE(OLD.code, 'لا يوجد') || ')';
            v_org_id := OLD.organization_id;
        WHEN 'products' THEN
            v_item_name := OLD.name || ' (SKU: ' || COALESCE(OLD.sku, 'لا يوجد') || ')';
            v_org_id := OLD.organization_id;
        WHEN 'customers' THEN
            v_item_name := OLD.name;
            v_org_id := OLD.organization_id;
        WHEN 'invoices' THEN
            v_item_name := 'فاتورة رقم: ' || OLD.invoice_number;
            v_org_id := OLD.organization_id;
        ELSE
            v_item_name := OLD.id::text;
            v_org_id := COALESCE(OLD.organization_id, public.get_my_org());
    END CASE;

    -- ب. تسجيل العملية في سجل الأمان بقاعدة البيانات تلقائياً
    INSERT INTO public.security_logs (
        event_type,
        description,
        performed_by,
        organization_id,
        metadata
    ) VALUES (
        TG_TABLE_NAME || '_delete',
        format('تم حذف %s من جدول %s بواسطة المستخدم', v_item_name, TG_TABLE_NAME),
        auth.uid(), -- جلب معرف المستخدم الحالي المسجل تلقائياً من الجلسة
        v_org_id,
        jsonb_build_object(
            'deleted_id', OLD.id,
            'table_name', TG_TABLE_NAME,
            'oldValue', format('الاسم: %s | البيانات المحذوفة كاملة: %s', v_item_name, to_jsonb(OLD)::text)
        )
    );
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 🛡️ ربط الدالة بجدول الحسابات المالية (Accounts)
DROP TRIGGER IF EXISTS trg_audit_accounts_delete ON public.accounts;
CREATE TRIGGER trg_audit_accounts_delete
BEFORE DELETE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

-- 3. 🛡️ ربط الدالة بجدول المنتجات (Products)
DROP TRIGGER IF EXISTS trg_audit_products_delete ON public.products;
CREATE TRIGGER trg_audit_products_delete
BEFORE DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

-- 4. 🛡️ ربط الدالة بجدول العملاء (Customers)
DROP TRIGGER IF EXISTS trg_audit_customers_delete ON public.customers;
CREATE TRIGGER trg_audit_customers_delete
BEFORE DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

-- 5. تحديث ذاكرة التخزين المؤقت
NOTIFY pgrst, 'reload schema';
