-- 🛠️ إضافة عمود الوصف المفقود لجدول التصنيفات
-- 🛠️ الإصلاح النهائي والشامل لجدول التصنيفات ومجموعات الإضافات
-- يحل مشاكل: Column not found، RLS violation، و RPC 404 (get_product_recipe_cost)

-- 0. إعادة منح الصلاحيات الكاملة للدور authenticated
-- هذا يحل مشكلة "permission denied for table" الناتجة عن تصفير المخطط (Schema Reset)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;

-- 1. إضافة وتحديث الأعمدة
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- التأكد من وجود أعمدة المنظمة في جداول الإضافات
ALTER TABLE public.modifier_groups ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.modifiers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.modifiers ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.order_item_modifiers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- ضبط القيمة الافتراضية للمنظمة لضمان التلقائية
ALTER TABLE public.item_categories ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.modifier_groups ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.modifiers ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
ALTER TABLE public.order_item_modifiers ALTER COLUMN organization_id SET DEFAULT public.get_my_org();

-- 2. تحديث نظام الحماية (RLS) للسماح بالإدارة
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

-- حذف كافة السياسات القديمة والمكررة لضمان عدم التعارض (Clean Slate)
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'item_categories' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.item_categories', pol.policyname);
    END LOOP;
END $$;

-- إنشاء سياسة عزل البيانات الموحدة
-- تسمح للقراءة والإضافة والتعديل والحذف لمستخدمي نفس الشركة
CREATE POLICY "item_categories_isolation_policy" ON public.item_categories
FOR ALL TO authenticated 
USING (organization_id = public.get_my_org()) 
WITH CHECK (organization_id = public.get_my_org());

-- 3. إصلاح صلاحيات جداول الإضافات (Modifiers)
-- يحل مشكلة: permission denied for table modifier_groups

ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

-- تنظيف وسياسة الوصول لجداول الإضافات (Clean Slate)
DO $$ 
DECLARE
    t text;
    pol record;
BEGIN
    FOREACH t IN ARRAY ARRAY['modifier_groups', 'modifiers', 'order_item_modifiers'] LOOP
        -- حذف أي سياسات قديمة متعارضة
        FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public') LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
        END LOOP;
        
        -- إنشاء سياسة العزل الموحدة (تسمح بالعمليات لمستخدمي نفس الشركة)
        EXECUTE format('
            CREATE POLICY "isolation_policy_%I" ON public.%I
            FOR ALL TO authenticated 
            USING (organization_id = public.get_my_org()) 
            WITH CHECK (organization_id = public.get_my_org())', t, t);
    END LOOP;
END $$;

-- تنظيف التريجرات القديمة قبل المزامنة لتجنب التعارض (Recursion) أثناء تنفيذ السكربت
DROP TRIGGER IF EXISTS trg_sync_item_cat ON public.item_categories;
DROP TRIGGER IF EXISTS trg_sync_menu_cat ON public.menu_categories;

-- 4. المزامنة والربط التلقائي بين تصنيفات المخزون والمنيو
-- يضمن ظهور التصنيفات الجديدة فوراً في نقطة البيع
DO $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));

    -- أ. نقل كافة التصنيفات الموجودة من المخزون إلى المنيو (مزامنة فورية)
    INSERT INTO public.menu_categories (id, name, organization_id, display_order)
    SELECT id, name, organization_id, COALESCE(display_order, 0)
    FROM public.item_categories 
    WHERE organization_id = v_org_id
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    WHERE (public.menu_categories.name IS DISTINCT FROM EXCLUDED.name OR public.menu_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);

    RAISE NOTICE 'تمت مزامنة كافة التصنيفات وتحديث أنواع الأصناف بنجاح.';
END $$;

-- 5. إنشاء نظام المزامنة التلقائية للمستقبل (Database Triggers)
-- هذا الجزء يضمن عدم تكرار المشكلة عند إضافة أي تصنيف جديد

CREATE OR REPLACE FUNCTION public.fn_sync_item_to_menu_category()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛑 صمام الأمان: منع التكرار اللانهائي إذا كان الاستدعاء ناتجاً عن تريجر آخر
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.menu_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    -- 🛑 كسر حلقة الدوران: لا تحدث إذا كانت البيانات متطابقة
    WHERE (public.menu_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.menu_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_item_cat
AFTER INSERT OR UPDATE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_item_to_menu_category();

-- العكس: من المنيو إلى المخزون (للحفاظ على تكامل البيانات)
CREATE OR REPLACE FUNCTION public.fn_sync_menu_to_item_category()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛑 صمام الأمان: منع التكرار اللانهائي إذا كان الاستدعاء ناتجاً عن تريجر آخر
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.item_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    -- 🛑 كسر حلقة الدوران: لا تحدث إذا كانت البيانات متطابقة
    WHERE (public.item_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.item_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_menu_cat
AFTER INSERT OR UPDATE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_menu_to_item_category();

-- 6. إنشاء دالة جلب تكلفة الوجبات (المفقودة)
-- يحل مشكلة: POST .../rpc/get_product_recipe_cost 404 (Not Found)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cost NUMERIC;
BEGIN
    SELECT COALESCE(SUM(r.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0) INTO v_cost
    FROM public.bill_of_materials r
    JOIN public.products ing ON r.raw_material_id = ing.id
    WHERE r.product_id = p_product_id;
    RETURN v_cost;
END; $$;

-- تحديث كاش النظام لضمان تعرف الـ API على العمود الجديد
SELECT public.refresh_saas_schema();