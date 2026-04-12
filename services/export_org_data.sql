-- 📦 دالة تصدير بيانات المنظمة بالكامل للأرشفة بصيغة JSON
-- مبرمجة لخدمة نظام TriPro ERP - SaaS Edition

CREATE OR REPLACE FUNCTION public.export_organization_data_json(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result jsonb;
    v_org_name text;
BEGIN
    -- 1. التأقق من وجود المنظمة وجلب اسمها
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المنظمة المطلوبة غير موجودة';
    END IF;

    -- 2. بناء الكائن الضخم الذي يحتوي على كافة الجداول
    v_result := jsonb_build_object(
        'archive_metadata', jsonb_build_object(
            'exported_at', now(),
            'organization_id', p_org_id,
            'organization_name', v_org_name,
            'system_version', '10.0-SaaS'
        ),
        
        -- القسم الأول: التعريفات والإعدادات
        'setup', jsonb_build_object(
            'settings', (SELECT to_jsonb(s) FROM public.company_settings s WHERE organization_id = p_org_id),
            'roles', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.roles t WHERE organization_id = p_org_id),
            'warehouses', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.warehouses t WHERE organization_id = p_org_id)
        ),

        -- القسم الثاني: المحاسبة المالية
        'accounting', jsonb_build_object(
            'accounts_chart', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.accounts t WHERE organization_id = p_org_id),
            'journal_entries', (SELECT COALESCE(jsonb_agg(to_jsonb(t) || jsonb_build_object('lines', (SELECT jsonb_agg(to_jsonb(l)) FROM public.journal_lines l WHERE l.journal_entry_id = t.id))), '[]') FROM public.journal_entries t WHERE organization_id = p_org_id),
            'receipt_vouchers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.receipt_vouchers t WHERE organization_id = p_org_id),
            'payment_vouchers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.payment_vouchers t WHERE organization_id = p_org_id),
            'cheques', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.cheques t WHERE organization_id = p_org_id)
        ),

        -- القسم الثالث: المبيعات والمشتريات
        'commercial', jsonb_build_object(
            'customers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.customers t WHERE organization_id = p_org_id),
            'suppliers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.suppliers t WHERE organization_id = p_org_id),
            'sales_invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(t) || jsonb_build_object('items', (SELECT jsonb_agg(to_jsonb(i)) FROM public.invoice_items i WHERE i.invoice_id = t.id))), '[]') FROM public.invoices t WHERE organization_id = p_org_id),
            'purchase_invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(t) || jsonb_build_object('items', (SELECT jsonb_agg(to_jsonb(i)) FROM public.purchase_invoice_items i WHERE i.purchase_invoice_id = t.id))), '[]') FROM public.purchase_invoices t WHERE organization_id = p_org_id),
            'quotations', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.quotations t WHERE organization_id = p_org_id)
        ),

        -- القسم الرابع: المخزون والمنتجات
        'inventory', jsonb_build_object(
            'products', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.products t WHERE organization_id = p_org_id),
            'stock_adjustments', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.stock_adjustments t WHERE organization_id = p_org_id),
            'opening_inventories', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.opening_inventories t WHERE organization_id = p_org_id)
        ),

        -- القسم الخامس: المطاعم
        'restaurant', jsonb_build_object(
            'tables', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.restaurant_tables t WHERE organization_id = p_org_id),
            'orders', (SELECT COALESCE(jsonb_agg(to_jsonb(t) || jsonb_build_object('items', (SELECT jsonb_agg(to_jsonb(i)) FROM public.order_items i WHERE i.order_id = t.id))), '[]') FROM public.orders t WHERE organization_id = p_org_id),
            'modifier_groups', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.modifier_groups t WHERE organization_id = p_org_id)
        ),

        -- القسم السادس: الموارد البشرية
        'hr', jsonb_build_object(
            'employees', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.employees t WHERE organization_id = p_org_id),
            'payrolls', (SELECT COALESCE(jsonb_agg(to_jsonb(t) || jsonb_build_object('items', (SELECT jsonb_agg(to_jsonb(i)) FROM public.payroll_items i WHERE i.payroll_id = t.id))), '[]') FROM public.payrolls t WHERE organization_id = p_org_id)
        )
    );

    RETURN v_result;
END; $$;

-- مثال لكيفية تشغيل الدالة لجلب البيانات:
-- SELECT public.export_organization_data_json('معرف-الشركة-هنا');