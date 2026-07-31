-- =================================================================
-- 🔒 حل مشكلة قيود المفاتيح الأجنبية وتتبع الحذف عند مسح المنظمات
-- التاريخ: 30 يوليو 2026
-- الوصف: تحديث دوال حذف الشركات لمنع تعارض القيود المرجعية مع سجلات الأمان
-- =================================================================

-- 1. تحديث دالة تتبع عمليات الحذف fn_audit_deletions لتجاوز التسجيل إذا كان النظام في وضع التجاوز/الاستعادة (Restore Mode)
CREATE OR REPLACE FUNCTION public.fn_audit_deletions()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_item_name text;
BEGIN
    -- 0. التحقق مما إذا كان النظام في وضع الاستعادة أو حذف منظمة لمنع أخطاء القيود المرجعية
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

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

-- 2. تحديث دالة حذف المنظمة بأمان fn_delete_organization_safe لتقوم بمسح البيانات التابعة بشكل متسلسل أولاً
CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tables text[] := ARRAY[
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'notification_preferences', 'security_logs', 
        'journal_attachments', 'order_item_modifiers', 'payroll_variables', 
        'opening_inventories', 'bill_of_materials', 'order_items', 'kitchen_orders', 
        'invoice_items', 'purchase_invoice_items', 'journal_lines', 'payroll_items', 
        'stock_adjustment_items', 'sales_return_items', 'purchase_return_items', 
        'delivery_orders', 'payments', 'orders', 'invoices', 'purchase_invoices', 
        'sales_returns', 'purchase_returns', 'journal_entries', 'payrolls', 
        'stock_adjustments', 'cheques', 'receipt_vouchers', 'payment_vouchers', 
        'table_sessions', 'shifts', 'work_orders', 'credit_notes', 'debit_notes', 
        'assets', 'products', 'customers', 'suppliers', 'employees', 
        'restaurant_tables', 'modifiers', 'modifier_groups', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings'
    ];
    v_t text;
BEGIN
    -- 1. التحقق من الصلاحيات (يجب أن يكون سوبر أدمن)
    IF public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: غير مصرح لك بحذف المنظمات من هذا المستوى.';
    END IF;

    -- 2. تفعيل وضع التجاوز (Restore Mode) لتعطيل حماية الحسابات "السيادية" والتدقيق التلقائي للحذف
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 3. تنظيف متسلسل للبيانات التابعة للمنظمة لمنع تعارض القيود المرجعية
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            -- نتجاوز أي خطأ في حال عدم وجود الجدول أو العمود في قاعدة البيانات الحالية
            NULL;
        END;
    END LOOP;

    -- 4. حذف المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- 5. إعادة الوضع الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);
END; $$;

-- 3. تحديث مخطط البيانات (Reload schema cache)
NOTIFY pgrst, 'reload schema';
