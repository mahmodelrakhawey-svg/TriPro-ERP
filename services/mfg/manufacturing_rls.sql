-- 🔒 سياسات أمان التصنيع (Manufacturing RLS)

ALTER TABLE public.mfg_work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_routings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_routing_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_order_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_step_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_actual_material_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_scrap_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_batch_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_material_request_items ENABLE ROW LEVEL SECURITY;

-- تفعيل حماية البيانات للرؤية لضمان عزل بيانات الساس
ALTER VIEW public.v_mfg_work_center_efficiency SET (security_invoker = on);

-- تطبيق سياسات الوصول الموحدة لكافة جداول التصنيع لضمان عزل البيانات (SaaS Isolation)
DO $$ 
DECLARE 
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['mfg_work_centers', 'mfg_routings', 'mfg_routing_steps', 'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials', 'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances', 'mfg_material_requests', 'mfg_material_request_items'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "mfg_select_policy_%I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "mfg_select_policy_%I" ON public.%I FOR SELECT TO authenticated 
            USING (organization_id = public.get_my_org() OR public.is_super_admin())', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "mfg_admin_policy_%I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "mfg_admin_policy_%I" ON public.%I FOR ALL TO authenticated 
            USING (
                (organization_id = public.get_my_org() AND public.get_my_role() IN (''admin'', ''manager''))
                OR public.is_super_admin()
            )', t, t);
    END LOOP;
END $$;
