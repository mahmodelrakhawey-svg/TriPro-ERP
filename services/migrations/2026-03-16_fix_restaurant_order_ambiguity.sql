-- =================================================================
-- TriPro ERP - Fix Restaurant Order Function Ambiguity
-- التاريخ: 16 مارس 2026
-- الوصف: حل مشكلة تكرار دالة create_restaurant_order (PGRST203)
-- =================================================================

-- حذف النسخة التي تستخدم text لنوع الطلب، والإبقاء على النسخة التي تستخدم public.order_type
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb);

-- تحديث ذاكرة التخزين المؤقت لـ PostgREST
NOTIFY pgrst, 'reload schema';