-- ====================================================================
-- Migration: Restaurant Industry Roles & Permissions Enterprise Seed
-- Date: 2026-08-27
-- Description: Dedicated restaurant roles (GM, Cashier, Waiter, Chef, Cook, Driver)
-- with granular permission mappings and auto-provisioning for all organizations.
-- ====================================================================

-- 🛡️ 1. تفعيل وضع الاستعادة وإسقاط أي مشغلات قديمة خاطئة على جدول الصلاحيات العام
SET app.restore_mode = 'on';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
        DROP TRIGGER IF EXISTS trg_force_org_id ON public.permissions;
        DROP TRIGGER IF EXISTS trg_force_org_id_on_insert ON public.permissions;
        DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.permissions;
        DROP TRIGGER IF EXISTS trg_ensure_org_id ON public.permissions;
        DROP TRIGGER IF EXISTS trg_permissions_org ON public.permissions;
    END IF;
END $$;

-- 🛡️ 2. زراعة وتحديث قائمة صلاحيات قطاع المطاعم والكافيهات التفصيلية
INSERT INTO public.permissions (module, action, description, is_sensitive, category) VALUES
('restaurant', 'pos', 'نقطة البيع وتسجيل طلبات الصالة والسفري والتوصيل', false, 'restaurant'),
('restaurant', 'waiter', 'استخدام واجهة الكابتن والويتر المحمولة للهاتف', false, 'restaurant'),
('restaurant', 'kitchen', 'الوصول لشاشات المطبخ KDS وشاشة التجميع Expo ومحطات الطهي', false, 'restaurant'),
('restaurant', 'kitchen_view', 'استعراض أوامر الطهي وتحديث حالات الوجبات بالمطبخ', false, 'restaurant'),
('restaurant', 'manage', 'إدارة الطاولات والجلسات والمحطات وإعدادات الصالة', false, 'restaurant'),
('restaurant', 'menu_manage', 'إدارة قائمة الطعام، الأصناف، الأسعار، والإضافات', true, 'restaurant'),
('restaurant', 'discount_comp', 'منح خصومات على الفاتورة أو ضيافة مجانية (Comp/Discount)', true, 'restaurant'),
('restaurant', 'void_order_item', 'إلغاء أو تعديل صنف بعد إرساله للمطبخ (Void Item)', true, 'restaurant'),
('restaurant', 'split_bill', 'تقسيم الشيك وفصل الحسابات بين رواد الطاولة', false, 'restaurant'),
('restaurant', 'transfer_table', 'نقل الطاولات ودمج الجلسات وتحويل الأصناف', false, 'restaurant'),
('restaurant', 'printers', 'إدارة وتوجيه طابعات المطبخ والإيصالات الشبكية ESC/POS', true, 'restaurant'),
('restaurant', 'loyalty', 'إدارة برنامج الولاء والمحفظة واستبدال النقاط والكاش باك', false, 'restaurant'),
('restaurant', 'channel_pricing', 'إدارة التسعير المتعدد حسب قنوات البيع (صالة، توصيل، تطبيقات)', true, 'restaurant'),
('restaurant', 'driver_dispatch', 'إدارة وتوزيع كباتن التوصيل والعهد النقدية COD', false, 'restaurant'),
('restaurant', 'tips_pool', 'إدارة مجمع وتوزيع التبس والإكراميات بين الصالة والمطبخ', true, 'restaurant'),
('restaurant', 'win_back', 'حملات استعادة العملاء الغائبين ونظام الـ CRM', false, 'restaurant'),
('restaurant', 'happy_hours', 'إدارة جداول وحملات الساعات السعيدة والتخفيضات المؤقتة', false, 'restaurant'),
('restaurant', 'butchering_yield', 'إدارة تشفية وتفكيك الذبائح واللحوم ومعامل الهدر والانكماش', true, 'restaurant'),
('restaurant', 'auto_reorder', 'توليد أوامر الشراء التلقائية بناءً على حدود أمان المخزون', false, 'restaurant'),
('restaurant', 'reports', 'استعراض تقارير مبيعات المطعم وأرباح الأصناف ومبيعات الكاشير', false, 'restaurant')
ON CONFLICT (module, action) DO UPDATE 
SET description = EXCLUDED.description,
    is_sensitive = EXCLUDED.is_sensitive,
    category = EXCLUDED.category;

-- 🛡️ 3. إنشاء وتثبيت الأدوار الستة المتخصصة للمطعم لكل منظمة مسجلة في النظام
DO $$
DECLARE
    org RECORD;
    v_mgr_id uuid;
    v_csh_id uuid;
    v_wtr_id uuid;
    v_chf_id uuid;
    v_cok_id uuid;
    v_drv_id uuid;
BEGIN
    FOR org IN SELECT id, name FROM public.organizations LOOP
        
        -- أ. مدير المطعم والصالة (Restaurant General Manager)
        SELECT id INTO v_mgr_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_manager';
        IF v_mgr_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_manager', 'مدير المطعم والصالة - تحكم تشغيلي ورقابي ومالي كامل', org.id)
            RETURNING id INTO v_mgr_id;
        END IF;

        -- ربط صلاحيات مدير المطعم
        DELETE FROM public.role_permissions WHERE role_id = v_mgr_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_mgr_id, p.id, org.id
        FROM public.permissions p
        WHERE p.module IN ('restaurant', 'pos')
           OR (p.module = 'sales' AND p.action IN ('view', 'create', 'return', 'quotation', 'apply_discount', 'view_cost_profit', 'export'))
           OR (p.module = 'customers' AND p.action IN ('view', 'create', 'update', 'manage_balance'))
           OR (p.module = 'products' AND p.action IN ('view', 'create', 'update', 'edit_pricing'))
           OR (p.module = 'inventory' AND p.action IN ('view', 'transfer', 'adjustment', 'wastage'))
           OR (p.module = 'purchases' AND p.action IN ('view', 'create', 'po_manage'))
           OR (p.module = 'manufacturing' AND p.action IN ('view', 'bom_manage', 'scrap_record'))
           OR (p.module = 'treasury' AND p.action IN ('receipt_create', 'view'))
           OR (p.module = 'reports' AND p.action IN ('general_view', 'financial_statements', 'profit_margins', 'export_data'))
        ON CONFLICT DO NOTHING;

        -- ب. كاشير المطعم (Restaurant POS Cashier)
        SELECT id INTO v_csh_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_cashier';
        IF v_csh_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_cashier', 'كاشير المطعم - فتح الشفت، الجرد الأعمى، الفواتير والسندات', org.id)
            RETURNING id INTO v_csh_id;
        END IF;

        -- ربط صلاحيات كاشير المطعم
        DELETE FROM public.role_permissions WHERE role_id = v_csh_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_csh_id, p.id, org.id
        FROM public.permissions p
        WHERE (p.module = 'pos' AND p.action IN ('open_shift', 'close_shift'))
           OR (p.module = 'restaurant' AND p.action IN ('pos', 'manage', 'split_bill', 'transfer_table', 'discount_comp', 'loyalty'))
           OR (p.module = 'sales' AND p.action IN ('view', 'create', 'return'))
           OR (p.module = 'customers' AND p.action IN ('view', 'create'))
           OR (p.module = 'products' AND p.action = 'view')
           OR (p.module = 'treasury' AND p.action IN ('receipt_create', 'view'))
        ON CONFLICT DO NOTHING;

        -- ج. كابتن الصالة والويتر المحمول (Floor Captain & Waiter)
        SELECT id INTO v_wtr_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_waiter';
        IF v_wtr_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_waiter', 'كابتن الصالة والويتر - واجهة الويتر المحمولة، طاولات، وإرسال للمطبخ', org.id)
            RETURNING id INTO v_wtr_id;
        END IF;

        -- ربط صلاحيات كابتن الصالة والويتر
        DELETE FROM public.role_permissions WHERE role_id = v_wtr_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_wtr_id, p.id, org.id
        FROM public.permissions p
        WHERE (p.module = 'restaurant' AND p.action IN ('pos', 'waiter', 'manage', 'split_bill', 'transfer_table'))
           OR (p.module = 'pos' AND p.action = 'open_shift')
           OR (p.module = 'products' AND p.action = 'view')
           OR (p.module = 'customers' AND p.action IN ('view', 'create'))
        ON CONFLICT DO NOTHING;

        -- د. شيف المطبخ التنفيذي (Executive Chef)
        SELECT id INTO v_chf_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_chef';
        IF v_chf_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_chef', 'شيف المطبخ التنفيذي - شاشات KDS، المحطات، المقادير، وتفكيك اللحوم', org.id)
            RETURNING id INTO v_chf_id;
        END IF;

        -- ربط صلاحيات شيف المطبخ
        DELETE FROM public.role_permissions WHERE role_id = v_chf_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_chf_id, p.id, org.id
        FROM public.permissions p
        WHERE (p.module = 'restaurant' AND p.action IN ('kitchen', 'kitchen_view', 'manage', 'butchering_yield', 'auto_reorder'))
           OR (p.module = 'manufacturing' AND p.action IN ('view', 'bom_manage', 'order_create', 'material_issue', 'production_finish', 'scrap_record'))
           OR (p.module = 'inventory' AND p.action IN ('view', 'transfer', 'adjustment', 'wastage', 'uom_manage'))
           OR (p.module = 'products' AND p.action IN ('view', 'create', 'update'))
           OR (p.module = 'purchases' AND p.action IN ('view', 'create', 'po_manage'))
        ON CONFLICT DO NOTHING;

        -- هـ. طاهي المحطة ومساعد المطبخ (Station Cook / Line Cook)
        SELECT id INTO v_cok_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_cook';
        IF v_cok_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_cook', 'طاهي المحطة - عرض وتجهيز طلبات محطة الطهي KDS', org.id)
            RETURNING id INTO v_cok_id;
        END IF;

        -- ربط صلاحيات طاهي المحطة
        DELETE FROM public.role_permissions WHERE role_id = v_cok_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_cok_id, p.id, org.id
        FROM public.permissions p
        WHERE (p.module = 'restaurant' AND p.action IN ('kitchen', 'kitchen_view'))
           OR (p.module = 'products' AND p.action = 'view')
        ON CONFLICT DO NOTHING;

        -- و. كابتن التوصيل والديليفري (Delivery Driver)
        SELECT id INTO v_drv_id FROM public.roles WHERE organization_id = org.id AND name = 'restaurant_driver';
        IF v_drv_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES ('restaurant_driver', 'كابتن التوصيل - استلام الطلبات، تفاصيل العملاء، وتوريد النقدية COD', org.id)
            RETURNING id INTO v_drv_id;
        END IF;

        -- ربط صلاحيات كابتن التوصيل
        DELETE FROM public.role_permissions WHERE role_id = v_drv_id;
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_drv_id, p.id, org.id
        FROM public.permissions p
        WHERE (p.module = 'restaurant' AND p.action IN ('manage', 'pos', 'driver_dispatch'))
           OR (p.module = 'sales' AND p.action = 'view')
           OR (p.module = 'customers' AND p.action = 'view')
        ON CONFLICT DO NOTHING;

    END LOOP;
END $$;
