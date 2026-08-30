-- =====================================================================
-- Migration: Seed Retail and Supermarket Preset Roles
-- Date: 2026-08-31
-- Description: Provisions pos_supervisor, storekeeper, and sales roles for all organizations
-- =====================================================================

DO $$
DECLARE
    org RECORD;
    v_sup_id UUID;
    v_stk_id UUID;
    v_sls_id UUID;
    v_perm_id UUID;
BEGIN
    FOR org IN SELECT id FROM public.organizations LOOP
        -- 1. Create or get pos_supervisor role
        SELECT id INTO v_sup_id FROM public.roles WHERE organization_id = org.id AND name = 'pos_supervisor';
        IF v_sup_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('pos_supervisor', 'رئيس الكاشيرية ومشرف نقطة البيع - اعتماد المرتجعات، كارت المشرف، وإلغاء الأصناف', org.id)
            RETURNING id INTO v_sup_id;
        END IF;

        -- 2. Create or get storekeeper role
        SELECT id INTO v_stk_id FROM public.roles WHERE organization_id = org.id AND name = 'storekeeper';
        IF v_stk_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('storekeeper', 'أمين المخازن والمستودعات - الجرد، التحويلات، وتتبع الصلاحيات', org.id)
            RETURNING id INTO v_stk_id;
        END IF;

        -- 3. Create or get sales role
        SELECT id INTO v_sls_id FROM public.roles WHERE organization_id = org.id AND name = 'sales';
        IF v_sls_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('sales', 'مسؤول ومندوب المبيعات - الفواتير، عروض الأسعار، وكشوف الحسابات', org.id)
            RETURNING id INTO v_sls_id;
        END IF;

        -- 4. Map permissions for pos_supervisor
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module IN ('retail', 'pos') OR 
                  (module = 'sales' AND action IN ('view', 'create', 'return', 'credit_note', 'customer_statement')) OR
                  (module = 'inventory' AND action IN ('view', 'stock_card', 'expiry_radar', 'shelf_restock', 'pda_stocktaking')) OR
                  (module = 'products' AND action IN ('view', 'pricing', 'update')) OR
                  (module = 'customers' AND action IN ('view', 'create')) OR
                  (module = 'treasury' AND action IN ('receipt_create', 'view')))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_sup_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

    END LOOP;
END $$;
