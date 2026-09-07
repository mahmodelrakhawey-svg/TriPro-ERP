-- =====================================================================
-- Master Migration: Provision All Pre-configured System Roles & Permissions
-- Date: 2026-08-31
-- Description: Standardizes all system roles (Retail, F&B, Accounting, Admin, HR) without duplicates
-- =====================================================================

DO $$
DECLARE
    org RECORD;
    v_role_id UUID;
    v_perm RECORD;
BEGIN
    FOR org IN SELECT id FROM public.organizations LOOP

        -- 1. 🛡️ Admin (مدير النظام)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'admin';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('admin', 'مسؤول عام ومدير النظام - كامل الصلاحيات الإدارية والمالية والتشغيلية', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        -- Grant all permissions to admin
        FOR v_perm IN SELECT id FROM public.permissions LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- 2. 📊 Accountant (محاسب مالي)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'accountant';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('accountant', 'محاسب مالي عام - القيود اليومية، السندات، الحسابات، البنوك، والتقارير المالية', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        FOR v_perm IN SELECT id FROM public.permissions 
            WHERE module IN ('accounting', 'treasury', 'assets') OR 
                  (module = 'reports' AND action IN ('general_view', 'financial_statements', 'aging_reports', 'export_data')) OR
                  (module IN ('sales', 'purchases') AND action IN ('view', 'approve')) LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- 3. 🛒 POS Supervisor (رئيس الكاشيرية ومشرف الصالة)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'pos_supervisor';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('pos_supervisor', 'رئيس الكاشيرية ومشرف نقطة البيع - اعتماد المرتجعات، كارت المشرف، إلغاء الأصناف، وسحب النقدية', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        FOR v_perm IN SELECT id FROM public.permissions 
            WHERE module IN ('retail', 'pos') OR 
                  (module = 'sales' AND action IN ('view', 'create', 'return', 'credit_note', 'customer_statement')) OR
                  (module = 'inventory' AND action IN ('view', 'stock_card', 'expiry_radar', 'shelf_restock', 'pda_stocktaking')) OR
                  (module = 'products' AND action IN ('view', 'pricing', 'update')) OR
                  (module = 'customers' AND action IN ('view', 'create')) OR
                  (module = 'treasury' AND action IN ('receipt_create', 'view')) LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- 4. 💵 Cashier (كاشير نقطة بيع)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'cashier';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('cashier', 'كاشير نقطة بيع - مسح الباركود، إصدار الفواتير، سندات القبض، وتعليق الفواتير', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        FOR v_perm IN SELECT id FROM public.permissions 
            WHERE (module = 'pos' AND action IN ('open_shift', 'view')) OR
                  (module = 'retail' AND action IN ('pos', 'price_checker', 'view')) OR
                  (module = 'sales' AND action IN ('view', 'create')) OR
                  (module = 'customers' AND action IN ('view', 'create')) OR
                  (module = 'products' AND action = 'view') OR
                  (module = 'treasury' AND action IN ('receipt_create', 'view')) LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- 5. 📦 Storekeeper (أمين مخازن ومستودعات)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'storekeeper';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('storekeeper', 'أمين مخازن ومستودعات - الجرد بالـ PDA، التحويلات، إثبات الهالك، ورادار الصلاحيات', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        FOR v_perm IN SELECT id FROM public.permissions 
            WHERE (module = 'products' AND action IN ('view', 'create', 'update')) OR
                  (module = 'inventory' AND action IN ('view', 'transfer', 'adjustment', 'wastage', 'uom_manage', 'count', 'manage')) OR
                  (module = 'purchases' AND action IN ('view', 'create')) LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- 6. 💼 Sales (مسؤول ومندوب مبيعات)
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'sales';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('sales', 'مسؤول ومندوب مبيعات - الفواتير، عروض الأسعار، أوامر البيع، وكشوف الحسابات', org.id)
            RETURNING id INTO v_role_id;
        END IF;
        FOR v_perm IN SELECT id FROM public.permissions 
            WHERE (module = 'sales' AND action IN ('view', 'create', 'return', 'quotation')) OR
                  (module = 'customers' AND action IN ('view', 'create', 'update')) OR
                  (module = 'products' AND action = 'view') LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm.id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

    END LOOP;
END $$;
