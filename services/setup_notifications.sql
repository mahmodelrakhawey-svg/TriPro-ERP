-- إعداد نظام الإخطارات الذكية
-- تشغيل هذا السكريبت مرة واحدة في Supabase

-- 1. إنشاء جدول الإخطارات
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  related_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. إنشاء الفهارس للأداء
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications("type");

-- 3. إنشاء جدول تكوين الإخطارات (تفضيلات المستخدم)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- تفعيل/تعطيل أنواع الإخطارات
  enable_overdue_payments BOOLEAN DEFAULT TRUE,
  enable_low_inventory BOOLEAN DEFAULT TRUE,
  enable_high_debt BOOLEAN DEFAULT TRUE,
  enable_pending_approval BOOLEAN DEFAULT TRUE,
  enable_due_date_alerts BOOLEAN DEFAULT TRUE,
  
  -- تفضيلات الإرسال
  email_notifications BOOLEAN DEFAULT FALSE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  push_notifications BOOLEAN DEFAULT TRUE,
  
  -- حدود التنبيهات
  overdue_payment_threshold_days INTEGER DEFAULT 1,
  low_inventory_threshold_percent INTEGER DEFAULT 20,
  high_debt_threshold_percent INTEGER DEFAULT 90,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. إنشاء جدول سجل الإخطارات (للتدقيق)
CREATE TABLE IF NOT EXISTS notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. إنشاء Trigger لتحديث updated_at في جدول الإخطارات
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_timestamp_trigger
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_notification_timestamp();

-- 6. إنشاء Trigger لتحديث updated_at في تفضيلات الإخطارات
CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_preferences_timestamp_trigger
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_notification_preferences_timestamp();

-- 7. إنشاء Function لتنظيف الإخطارات المنتهية الصلاحية
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 8. إنشاء Function لحساب عدد الإخطارات غير المقروءة
CREATE OR REPLACE FUNCTION get_unread_notification_count(user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT COUNT(*) FROM notifications 
     WHERE notifications.user_id = $1 AND is_read = FALSE),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- 9. السماح بالوصول
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_audit_log ENABLE ROW LEVEL SECURITY;

-- 10. إنشاء Policies للأمان
-- المستخدمون يمكنهم رؤية إخطاراتهم فقط
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

-- المستخدمون يمكنهم تحديث إخطاراتهم
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id);

-- المستخدمون يمكنهم حذف إخطاراتهم
CREATE POLICY "Users can delete their own notifications"
ON notifications FOR DELETE
USING (auth.uid() = user_id);

-- المستخدمون يمكنهم رؤية تفضيلات الإخطارات الخاصة بهم
CREATE POLICY "Users can view their own preferences"
ON notification_preferences FOR SELECT
USING (auth.uid() = user_id);

-- المستخدمون يمكنهم تحديث تفضيلات الإخطارات الخاصة بهم
CREATE POLICY "Users can update their own preferences"
ON notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- المستخدمون يمكنهم إنشاء تفضيلات الإخطارات الخاصة بهم
CREATE POLICY "Users can create their own preferences"
ON notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- السماح للخدمات بالوصول إلى الإشعارات (للعمليات التلقائية)
CREATE POLICY "Service role can manage notifications"
ON notifications FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 11. إنشاء عرض مفيد للإخطارات النشطة
CREATE OR REPLACE VIEW active_notifications AS
SELECT 
  n.id,
  n.user_id,
  n.title,
  n.message,
  n."type" as notification_type,
  n.priority,
  n.is_read,
  n.action_url,
  n.related_id,
  n.created_at,
  n.expires_at,
  n.updated_at,
  np.enable_overdue_payments,
  np.enable_low_inventory,
  np.enable_high_debt,
  np.enable_pending_approval,
  np.enable_due_date_alerts,
  np.email_notifications,
  np.sms_notifications,
  np.push_notifications
FROM notifications n
LEFT JOIN notification_preferences np ON n.user_id = np.user_id
WHERE (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)
  AND n.is_read = FALSE
ORDER BY 
  CASE 
    WHEN n.priority = 'high' THEN 1
    WHEN n.priority = 'medium' THEN 2
    WHEN n.priority = 'low' THEN 3
  END,
  n.created_at DESC;

-- 12. منح الأذونات
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;
GRANT SELECT ON notification_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;

-- ملاحظات:
-- - يجب تشغيل cleanup_expired_notifications() دورياً (مثلاً يومياً)
-- - يمكن جدولة العمليات الدورية باستخدام pg_cron extension
-- - الدالة runAllChecks() في notificationService يجب استدعاؤها كل ساعة
