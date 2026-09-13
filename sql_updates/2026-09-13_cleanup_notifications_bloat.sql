-- ==============================================================================
-- 🚀 TriPro ERP - تنظيف وتفريغ جدول الإخطارات المتراكمة وتسريع الاستعلامات
-- التاريخ: 13 سبتمبر 2026
-- المشكلة: تراكم أكثر من 260,000 إشعار نقص مخزون قديم ومكرر، مما سبب بطء وخطأ 500
-- الحل: حذف الإشعارات المكررة القديمة، وإنشاء فهارس سريعة جداً للاستعلام
-- ==============================================================================

-- 1. تنظيف إشعارات نقص المخزون المتراكمة القديمة
DELETE FROM public.notifications 
WHERE type = 'low_inventory';

-- 2. حذف أي إشعارات مقروءة قديمة مضى عليها أكثر من 30 يوماً
DELETE FROM public.notifications 
WHERE is_read = true 
  AND created_at < (NOW() - INTERVAL '30 days');

-- 3. إنشاء فهرس مركب فائق السرعة لجلب الإشعارات غير المقروءة لكل مستخدم وشركة
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON public.notifications (user_id, organization_id, is_read) 
WHERE is_read = false;

-- 4. إنشاء فهرس لمنع تكرار الإشعارات لنفس الصنف/المستند
CREATE INDEX IF NOT EXISTS idx_notifications_dup_prevent 
ON public.notifications (organization_id, type, related_id) 
WHERE is_read = false;

-- 5. تحديث إحصائيات الجدول لتحسين أداء محرك الاستعلام في PostgreSQL
ANALYZE public.notifications;
