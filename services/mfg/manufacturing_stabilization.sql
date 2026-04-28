-- 🛠️ ملف استقرار مديول التصنيع (Manufacturing Stabilization)

-- إضافة عمود "نوع المنتج" لتحديد ما إذا كان "تحت التشغيل"
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard'; 
-- standard (منتج عادي), raw (مادة خام), wip (تحت التشغيل)

-- ضمان وجود الـ Triggers لفرض الـ organization_id
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN ARRAY ARRAY['mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials', 'mfg_actual_material_usage'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_force_org_id_%I ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER trg_force_org_id_%I 
                        BEFORE INSERT ON public.%I 
                        FOR EACH ROW EXECUTE FUNCTION public.fn_force_org_id_on_insert()', t, t);
    END LOOP;
END $$;

-- فهرس لتحسين سرعة البحث في أوامر الإنتاج
CREATE INDEX IF NOT EXISTS idx_mfg_orders_status ON public.mfg_production_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_mfg_progress_order ON public.mfg_order_progress(production_order_id);
CREATE INDEX IF NOT EXISTS idx_mfg_step_materials_step ON public.mfg_step_materials(step_id);
CREATE INDEX IF NOT EXISTS idx_mfg_actual_usage_progress ON public.mfg_actual_material_usage(order_progress_id);
