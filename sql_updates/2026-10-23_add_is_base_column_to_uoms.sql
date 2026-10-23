-- ==============================================================================
-- 🌟 TriPro ERP — إضافة عمود is_base لجدول وحدات القياس uoms
-- التاريخ: 2026-10-23
-- الغرض: منع خطأ 400 Bad Request عند استعلام الوحدات في شاشات المشتريات والتحليل
-- ==============================================================================

ALTER TABLE public.uoms ADD COLUMN IF NOT EXISTS is_base BOOLEAN DEFAULT false;
UPDATE public.uoms SET is_base = true WHERE uom_type IN ('reference', 'base') OR ratio = 1;
