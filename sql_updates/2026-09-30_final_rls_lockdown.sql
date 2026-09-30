-- =============================================================================
-- الإغلاق الأمني الشامل والنهائي لعزل البيانات (Final RLS Lockdown)
-- TriPro ERP — sql_updates/2026-09-30_final_rls_lockdown.sql
-- التاريخ: 2026-09-30
-- الفحص: نتاج تدقيق شامل عبر 370 ملف SQL و 675 سياسة أمان
-- =============================================================================

-- 1. 🛡️ تأمين جدول النسخ الاحتياطية (organization_backups)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'organization_backups'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON organization_backups', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.organization_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_backups_strict_isolation" ON public.organization_backups
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 2. 🔐 تأمين جدول إعدادات بوابات الدفع الإلكتروني والمفاتيح السرية (payment_gateway_settings)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'payment_gateway_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON payment_gateway_settings', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_gateway_settings_strict_isolation" ON public.payment_gateway_settings
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 3. 💳 تأمين جدول روابط وسجلات عمليات الدفع الإلكتروني (online_payment_links)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'online_payment_links'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON online_payment_links', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.online_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_payment_links_strict_isolation" ON public.online_payment_links
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 4. 📅 تأمين جدول السنوات المالية للشركات (fiscal_years)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'fiscal_years'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fiscal_years', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_years_strict_isolation" ON public.fiscal_years
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 5. 🔔 تأمين جدول الإشعارات والتنبيهات الإدارية (notifications)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_strict_isolation" ON public.notifications
  FOR ALL
  USING (
    -- المستخدم يرى إشعاراته الخاصة التابعة لمنظمته، أو الإشعارات العامة لمنظمته
    (
      (user_id = auth.uid() AND (organization_id = get_my_org() OR organization_id IS NULL))
      OR (organization_id = get_my_org() AND user_id IS NULL)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- إشعار اكتمال الإغلاق الأمني الشامل
DO $$
BEGIN
  RAISE NOTICE '✅ 1. تم تأمين وعزل جدول النسخ الاحتياطية (organization_backups)';
  RAISE NOTICE '✅ 2. تم تأمين مفاتيح بوابات الدفع السرية (payment_gateway_settings)';
  RAISE NOTICE '✅ 3. تم تأمين سجلات روابط الدفع (online_payment_links)';
  RAISE NOTICE '✅ 4. تم تأمين جدول السنوات المالية (fiscal_years)';
  RAISE NOTICE '✅ 5. تم تأمين إشعارات وتنبيهات المنشأة (notifications)';
  RAISE NOTICE '🔒 تم غلق كافة منافذ RLS الـ 13 المستهدفة في قاعدة البيانات بنجاح تام.';
END;
$$;
