-- =================================================================
-- TriPro ERP - Fix Product Type Check Constraint
-- التاريخ: 16 مارس 2026
-- الوصف: تحديث قيد التحقق (Check Constraint) في جدول المنتجات للسماح بأنواع (RAW_MATERIAL, MANUFACTURED)
-- =================================================================

-- 1. حذف القيد القديم الذي يسبب المشكلة (قد يكون اسمه items_item_type_check أو products_item_type_check)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_item_type_check;

-- 2. إضافة القيد الجديد ليشمل كافة الأنواع المطلوبة
ALTER TABLE public.products 
ADD CONSTRAINT products_item_type_check 
CHECK (item_type IN ('STOCK', 'SERVICE', 'RAW_MATERIAL', 'MANUFACTURED'));

-- 3. تنشيط التحديث
NOTIFY pgrst, 'reload schema';