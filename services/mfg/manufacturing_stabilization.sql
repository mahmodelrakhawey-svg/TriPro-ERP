-- ️ ملف استقرار مديول التصنيع - Manufacturing Stabilization
-- الهدف: تحسين البحث عن الأرقام التسلسلية وإعداد رؤى التقارير

BEGIN;

-- 1. إنشاء رؤية السيريالات المتاحة في المخازن
DROP VIEW IF EXISTS public.v_mfg_available_serials CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_available_serials WITH (security_invoker = true) AS
SELECT 
    bs.id,
    bs.serial_number,
    p.name as product_name,
    p.sku as product_code,
    po.order_number,
    po.batch_number,
    bs.created_at as production_date,
    bs.organization_id,
    bs.status as serial_status
FROM public.mfg_batch_serials bs
JOIN public.products p ON bs.product_id = p.id
JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
WHERE bs.status = 'in_stock';

-- 2. رؤية التتبع الشاملة لكافة السيريالات وحالاتها (Traceability Master Table)
-- مخصصة للمحاسب لتتبع حركة كل قطعة من الإنتاج حتى البيع النهائي
DROP VIEW IF EXISTS public.v_mfg_serials_master_tracker;
CREATE VIEW public.v_mfg_serials_master_tracker WITH (security_invoker = true) AS
SELECT 
    bs.serial_number,
    p.name as product_name,
    p.sku as product_sku,
    po.order_number,
    po.batch_number,
    bs.status as serial_status,
    bs.created_at as production_date,
    bs.organization_id
FROM public.mfg_batch_serials bs
JOIN public.products p ON bs.product_id = p.id
JOIN public.mfg_production_orders po ON bs.production_order_id = po.id;

CREATE INDEX IF NOT EXISTS idx_mfg_po_number ON public.mfg_production_orders(order_number);

-- منح الصلاحيات اللازمة للرؤى لضمان ظهورها في واجهة المستخدم
GRANT SELECT ON public.v_mfg_serials_master_tracker TO authenticated;
GRANT SELECT ON public.v_mfg_available_serials TO authenticated;

COMMIT;