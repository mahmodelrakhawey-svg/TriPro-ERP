-- 🛡️ مديول الجودة وتحليل الانحرافات (QC & Variance)

-- 1. جدول عمليات فحص الجودة
CREATE TABLE IF NOT EXISTS public.mfg_qc_inspections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    inspector_id uuid REFERENCES auth.users(id),
    status text CHECK (status IN ('pass', 'fail', 'rework')),
    defect_type text,
    notes text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- إضافة عمود التحقق من الجودة في جدول التقدم إذا لم يكن موجوداً
ALTER TABLE public.mfg_order_progress ADD COLUMN IF NOT EXISTS qc_verified boolean DEFAULT NULL;

-- 2. دالة تسجيل نتيجة الفحص
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(
    p_progress_id uuid,
    p_status text,
    p_notes text,
    p_defect_type text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    INSERT INTO public.mfg_qc_inspections (progress_id, inspector_id, status, notes, defect_type, organization_id)
    VALUES (p_progress_id, auth.uid(), p_status, p_notes, p_defect_type, public.get_my_org());
    
    -- تحديث حالة التقدم بناءً على نتيجة الفحص
    UPDATE public.mfg_order_progress 
    SET 
        qc_verified = CASE 
            WHEN p_status = 'pass' THEN true 
            WHEN p_status = 'rework' THEN NULL 
            ELSE false 
        END,
        status = CASE WHEN p_status = 'rework' THEN 'active' ELSE status END
    WHERE id = p_progress_id;
END; $$;

-- 3. رؤية تحليل انحراف المواد (BOM Variance View)
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE VIEW public.v_mfg_bom_variance AS
SELECT 
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    amu.standard_quantity,
    amu.actual_quantity,
    (amu.actual_quantity - amu.standard_quantity) as variance_qty,
    CASE 
        WHEN amu.standard_quantity > 0 
        THEN ROUND(((amu.actual_quantity - amu.standard_quantity) / amu.standard_quantity) * 100, 2)
        ELSE 0 
    END as variance_percentage,
    po.organization_id
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.products rm ON amu.raw_material_id = rm.id;

-- 4. تأمين البيانات (RLS)
ALTER TABLE public.mfg_qc_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "QC isolation policy" ON public.mfg_qc_inspections;
CREATE POLICY "QC isolation policy" ON public.mfg_qc_inspections 
FOR ALL TO authenticated USING (organization_id = public.get_my_org());

GRANT SELECT ON public.v_mfg_bom_variance TO authenticated;