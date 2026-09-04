-- ==============================================================================
-- 📦 سكريبت إصلاح حركات وتقارير المخزون (Inventory Tables & Columns Repair)
-- TriPro ERP — services/migrations/inventory_schema_repair.sql
-- ==============================================================================
-- يقوم هذا السكربت بإضافة كافة الأعمدة الناقصة لجداول التسويات المخزنية والتحويلات والمنتجات
-- لمنع حدوث خطأ 400 في تقرير كارت الصنف وتقرير حركة المخزون
-- ==============================================================================

BEGIN;

-- 1️⃣ إصلاح جدول المنتجات (products)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'piece';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_uom_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uom_category_id UUID;

-- 2️⃣ إصلاح جداول التسويات المخزنية (stock_adjustments & stock_adjustment_items)
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS uom_id UUID;
ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0;
ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS total_cost NUMERIC DEFAULT 0;
ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'adjustment';

-- تفعيل RLS للتسويات المخزنية
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stock_adjustments" ON public.stock_adjustments;
CREATE POLICY "Allow authenticated stock_adjustments" ON public.stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stock_adjustment_items" ON public.stock_adjustment_items;
CREATE POLICY "Allow authenticated stock_adjustment_items" ON public.stock_adjustment_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3️⃣ إصلاح جداول التحويلات المخزنية (stock_transfers & stock_transfer_items)
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES public.warehouses(id);
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_warehouse_id UUID REFERENCES public.warehouses(id);
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS uom_id UUID;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stock_transfers" ON public.stock_transfers;
CREATE POLICY "Allow authenticated stock_transfers" ON public.stock_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stock_transfer_items" ON public.stock_transfer_items;
CREATE POLICY "Allow authenticated stock_transfer_items" ON public.stock_transfer_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4️⃣ إصلاح جداول المرتجعات (sales_returns & purchase_returns)
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS uom_id UUID;

ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS uom_id UUID;

COMMIT;
