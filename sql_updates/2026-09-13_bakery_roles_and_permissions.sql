-- =====================================================================
-- 🍰 حزمة صلاحيات وأدوار حلواني ومصانع لينزا (Bakery & Confectionery Roles)
-- التاريخ: 2026-09-13
-- الوصف: إنشاء وربط 7 أدوار تخصصية لمصنع ومعارض الحلويات:
--   1. مسؤول تحويلات مخازن الخامات (التحويل بين المخازن)
--   2. مسؤول التصنيع والتشغيل (قوائم المواد والمراحل BOM)
--   3. محاسب مشتريات ومدخل بيانات (Data Entry فواتير وموردين)
--   4. كاشير معارض وفروع الحلويات (POS Cashier)
--   5. مشرف ومعتمد معارض الحلويات (Branch Supervisor)
--   6. مراقب تكاليف الأغذية والتصنيع (Pastry Cost Controller)
--   7. المدير المالي والمشرف العام (CFO / Financial Director)
-- =====================================================================

DO $$
DECLARE
    org RECORD;
    v_role_id UUID;
    v_perm_id UUID;
BEGIN
    FOR org IN SELECT id FROM public.organizations LOOP

        -- -------------------------------------------------------------
        -- 1. مسؤول تحويلات مخازن الخامات (bakery_transfers)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_transfers';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_transfers', 'مسؤول تحويلات مخازن الخامات - تحويل المواد الخام بين المخازن ومتابعة الأرصدة', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'مسؤول تحويلات مخازن الخامات - تحويل المواد الخام بين المخازن ومتابعة الأرصدة'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات التحويلات المخزنية
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'inventory' AND action IN ('view', 'transfer', 'stock_card'))
               OR (module = 'products' AND action = 'view')
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 2. مسؤول التصنيع والتشغيل (bakery_production)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_production';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_production', 'مسؤول التصنيع والتشغيل - إعداد ومراجعة قوائم المواد BOM وأوامر التشغيل', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'مسؤول التصنيع والتشغيل - إعداد ومراجعة قوائم المواد BOM وأوامر التشغيل'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات التصنيع والمراحل
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'manufacturing' AND action IN ('view', 'bom_manage', 'order_create', 'material_issue', 'production_finish', 'scrap_record', 'qc_inspect'))
               OR (module = 'products' AND action IN ('view', 'create', 'update'))
               OR (module = 'inventory' AND action IN ('view', 'transfer', 'stock_card'))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 3. محاسب مشتريات ومدخل بيانات (bakery_purchasing)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_purchasing';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_purchasing', 'محاسب مشتريات ومدخل بيانات - تسجيل فواتير المشتريات والموردين اليومية', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'محاسب مشتريات ومدخل بيانات - تسجيل فواتير المشتريات والموردين اليومية'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات المشتريات والداتا إنتري
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'purchases' AND action IN ('view', 'create', 'update', 'po_manage', 'price_history'))
               OR (module = 'suppliers' AND action IN ('view', 'create', 'update'))
               OR (module = 'products' AND action IN ('view', 'create'))
               OR (module = 'inventory' AND action = 'view')
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 4. كاشير معارض وفروع الحلويات (bakery_cashier)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_cashier';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_cashier', 'كاشير معارض وفروع الحلويات - إصدار فواتير الكاشير والوزن وتقفيل الورديات', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'كاشير معارض وفروع الحلويات - إصدار فواتير الكاشير والوزن وتقفيل الورديات'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات كاشير المعرض
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'pos' AND action IN ('open_shift', 'close_shift', 'view'))
               OR (module = 'retail' AND action IN ('pos', 'price_checker', 'view'))
               OR (module = 'sales' AND action IN ('view', 'create'))
               OR (module = 'customers' AND action IN ('view', 'create'))
               OR (module = 'products' AND action = 'view')
               OR (module = 'treasury' AND action IN ('receipt_create', 'view'))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 5. مشرف ومعتمد معارض الحلويات (bakery_branch_supervisor)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_branch_supervisor';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_branch_supervisor', 'مشرف ومعتمد معارض الحلويات - استلام طلبيات المصنع واعتماد الإلغاء والهالك', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'مشرف ومعتمد معارض الحلويات - استلام طلبيات المصنع واعتماد الإلغاء والهالك'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات مشرف المعرض
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'retail' AND action IN ('pos', 'returns', 'void', 'cash_drop', 'promotions', 'supervisor_badge', 'price_checker', 'shifts_manage', 'view'))
               OR (module = 'pos' AND action IN ('open_shift', 'close_shift', 'view'))
               OR (module = 'sales' AND action IN ('view', 'create', 'return', 'credit_note', 'apply_discount'))
               OR (module = 'inventory' AND action IN ('view', 'transfer', 'wastage', 'stock_card'))
               OR (module = 'products' AND action IN ('view', 'pricing', 'update'))
               OR (module = 'customers' AND action IN ('view', 'create'))
               OR (module = 'treasury' AND action IN ('receipt_create', 'view'))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 6. مراقب تكاليف الأغذية والتصنيع (bakery_cost_controller)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_cost_controller';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_cost_controller', 'مراقب تكاليف الأغذية والتصنيع - مراقبة تكلفة الخامات وهدر التصنيع وهوامش الربح', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'مراقب تكاليف الأغذية والتصنيع - مراقبة تكلفة الخامات وهدر التصنيع وهوامش الربح'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات مراقبة التكاليف
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE (module = 'manufacturing' AND action IN ('view', 'bom_manage', 'wip_close'))
               OR (module = 'reports' AND action IN ('general_view', 'profit_margins', 'export_data'))
               OR (module = 'sales' AND action IN ('view', 'view_cost_profit'))
               OR (module = 'inventory' AND action IN ('view', 'wastage', 'recalculate_cost', 'stock_card'))
               OR (module = 'purchases' AND action IN ('view', 'price_history'))
               OR (module = 'products' AND action IN ('view', 'edit_pricing'))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;


        -- -------------------------------------------------------------
        -- 7. المدير المالي والمشرف العام (bakery_cfo)
        -- -------------------------------------------------------------
        SELECT id INTO v_role_id FROM public.roles WHERE organization_id = org.id AND name = 'bakery_cfo';
        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('bakery_cfo', 'المدير المالي والمشرف العام - رقابة شاملة على الحسابات، موازين المراجعة، والاعتمادات', org.id)
            RETURNING id INTO v_role_id;
        ELSE
            UPDATE public.roles 
            SET description = 'المدير المالي والمشرف العام - رقابة شاملة على الحسابات، موازين المراجعة، والاعتمادات'
            WHERE id = v_role_id;
        END IF;

        -- ربط صلاحيات المدير المالي
        FOR v_perm_id IN 
            SELECT id FROM public.permissions 
            WHERE module IN ('accounting', 'treasury', 'assets', 'reports', 'hr')
               OR (module = 'sales' AND action IN ('view', 'approve', 'view_cost_profit', 'export'))
               OR (module = 'purchases' AND action IN ('view', 'approve', 'export'))
               OR (module = 'inventory' AND action IN ('view', 'adjustment_approve', 'recalculate_cost', 'wastage'))
               OR (module = 'manufacturing' AND action IN ('view', 'wip_close'))
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

    END LOOP;
END $$;
