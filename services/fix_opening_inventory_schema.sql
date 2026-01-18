-- 🛠️ إصلاح هيكل بضاعة أول المدة
-- إنشاء جدول لحفظ أرصدة أول المدة بشكل دائم لضمان عدم ضياعها عند إعادة الاحتساب

CREATE TABLE IF NOT EXISTS public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- إضافة فهرس لتسريع البحث
CREATE INDEX IF NOT EXISTS idx_opening_inventories_product ON public.opening_inventories(product_id);
CREATE INDEX IF NOT EXISTS idx_opening_inventories_warehouse ON public.opening_inventories(warehouse_id);