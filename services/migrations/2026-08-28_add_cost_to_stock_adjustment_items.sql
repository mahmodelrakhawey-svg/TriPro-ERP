-- ==============================================================================
-- Migration: إضافة أعمدة التكلفة إلى جدول stock_adjustment_items
-- التاريخ: 2026-08-28
-- الهدف: تسجيل تكلفة الوحدة والتكلفة الإجمالية في بنود التسوية المخزنية
-- تُستخدم عند ترحيل جلسات التشفية لضمان انعكاس التكلفة في كارت الصنف
-- ==============================================================================

-- إضافة عمود تكلفة الوحدة (تكلفة الكيلو للحوم أو تكلفة الوحدة لغيرها)
ALTER TABLE public.stock_adjustment_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15, 4) DEFAULT 0.00;

-- إضافة عمود إجمالي التكلفة (unit_cost × quantity)
ALTER TABLE public.stock_adjustment_items
ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15, 4) DEFAULT 0.00;

COMMENT ON COLUMN public.stock_adjustment_items.unit_cost IS 'تكلفة الوحدة الواحدة وقت التسوية (مثلاً: تكلفة الكيلو المستخرج من التشفية)';
COMMENT ON COLUMN public.stock_adjustment_items.total_cost IS 'إجمالي التكلفة = unit_cost × quantity، يُستخدم لتتبع قيمة المخزون في كارت الصنف';

-- التحقق من النتيجة
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stock_adjustment_items'
  AND column_name IN ('unit_cost', 'total_cost');
